// WebGPU compute-driven point cloud renderer.
//
// Pipeline per frame:
//   1. compute pass: decimate by budget/density, frustum-cull every point,
//      append surviving source indices into dstIndex, increment indirect args.
//   2. render pass: drawIndirect point-list; vertex shader reads source
//      buffers through dstIndex and resolves color mode / class visibility.
//
// This avoids WebGL's per-frame vertex upload and lets the GPU do the culling.

import * as THREE from 'three';

export interface WebGPUPointCloudData {
  positions: Float32Array;
  colors: Float32Array | null;
  classIds: Uint8Array;
  intensities: Float32Array;
  spanZ: number;
  pointCount: number;
}

export interface WebGPUPointCloudStyle {
  colorMode: 'rgb' | 'class' | 'height' | 'intensity' | 'power_highlight' | 'danger';
  visibleClasses: number[];
  classColors: Float32Array; // 32 * vec4
  pointSize: number;
  maxPointSize: number;
  pointShape: 'square' | 'circle' | 'paraboloid';
  pointBudget: number;
  pointDensity: number;
  spanZ: number;
  dangerHeight: number;
  hasColor: boolean;
}

const UNIFORM_SIZE = 656;

const WGSL = /* wgsl */ `
struct Uniforms {
  viewProj : mat4x4<f32>,
  cameraPos : vec4f,
  params : vec4f,
  range : vec4f,
  budget : vec4u,
  classColors : array<vec4f, 32>,
  visibleMask : vec4u,
}

struct IndirectArgs {
  vertexCount : atomic<u32>,
  instanceCount : u32,
  firstVertex : u32,
  firstInstance : u32,
}

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(0) @binding(1) var<storage, read> srcPos : array<vec3f>;
@group(0) @binding(2) var<storage, read> srcColor : array<vec4f>;
@group(0) @binding(3) var<storage, read> srcClass : array<u32>;
@group(0) @binding(4) var<storage, read_write> dstIndex : array<u32>;
@group(0) @binding(5) var<storage, read_write> indirect : IndirectArgs;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let i = gid.x;
  if (i >= u.budget.z) { return; }
  let srcIdx = i * u.budget.y;
  if (srcIdx >= u.budget.x) { return; }

  let pos = srcPos[srcIdx];
  let clip = u.viewProj * vec4f(pos, 1.0);
  if (clip.w <= 0.0) { return; }
  let ndc = clip.xyz / clip.w;
  if (ndc.x < -1.1 || ndc.x > 1.1 || ndc.y < -1.1 || ndc.y > 1.1 || ndc.z < -1.1 || ndc.z > 1.1) {
    return;
  }

  let slot = atomicAdd(&indirect.vertexCount, 1u);
  if (slot < u.budget.z) {
    dstIndex[slot] = srcIdx;
  }
}

struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) color : vec4f,
  @location(1) pointSize : f32,
}

fn heightColor(t : f32) -> vec3f {
  let c0 = vec3f(0.10, 0.25, 0.65);
  let c1 = vec3f(0.10, 0.75, 0.90);
  let c2 = vec3f(0.25, 0.80, 0.30);
  let c3 = vec3f(0.95, 0.75, 0.15);
  let c4 = vec3f(0.90, 0.15, 0.10);
  if (t < 0.25) { return mix(c0, c1, t / 0.25); }
  if (t < 0.50) { return mix(c1, c2, (t - 0.25) / 0.25); }
  if (t < 0.75) { return mix(c2, c3, (t - 0.50) / 0.25); }
  return mix(c3, c4, (t - 0.75) / 0.25);
}

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  let srcIdx = dstIndex[vi];
  let worldPos = srcPos[srcIdx];
  let cls = srcClass[srcIdx];
  let rgb = srcColor[srcIdx].xyz;
  let intensity = srcColor[srcIdx].w;
  let mode = u.params.w;
  let mask = u.visibleMask.x;
  let bit = 1u << (cls & 31u);

  var outColor : vec4f = vec4f(0.0);
  if ((mask & bit) != 0u) {
    if (mode == 0.0) {
      outColor = vec4f(mix(vec3f(0.75), rgb, u.range.z), 1.0);
    } else if (mode == 1.0) {
      outColor = u.classColors[cls & 31u];
    } else if (mode == 2.0) {
      let h = clamp(worldPos.y / max(u.range.x, 0.001), 0.0, 1.0);
      outColor = vec4f(heightColor(h), 1.0);
    } else if (mode == 3.0) {
      let v = clamp(intensity * 1.4 + 0.1, 0.0, 1.0);
      outColor = vec4f(vec3f(v), 1.0);
    } else if (mode == 4.0) {
      if (cls == 14u) { outColor = vec4f(0.0, 0.949, 1.0, 1.0); }
      else if (cls == 15u) { outColor = vec4f(1.0, 0.718, 0.0, 1.0); }
      else if (cls == 16u) { outColor = vec4f(0.851, 0.275, 0.937, 1.0); }
      else if (u.range.z > 0.5) { outColor = vec4f(rgb, 1.0); }
      else { outColor = u.classColors[cls & 31u]; }
    } else {
      if (cls == 5u || worldPos.y > u.range.y) { outColor = vec4f(0.937, 0.267, 0.267, 1.0); }
      else if (cls == 14u) { outColor = vec4f(0.220, 0.722, 0.973, 1.0); }
      else { outColor = vec4f(0.392, 0.424, 0.471, 1.0); }
    }
  }

  let dist = distance(u.cameraPos.xyz, worldPos);
  let size = clamp(u.params.x * (280.0 / max(dist, 0.1)), 1.0, u.params.y);
  var out : VSOut;
  out.pos = u.viewProj * vec4f(worldPos, 1.0);
  out.color = outColor;
  out.pointSize = size;
  return out;
}

@fragment
fn fs(@builtin(point_coord) pc : vec2f, in : VSOut) -> @location(0) vec4f {
  if (in.color.a < 0.01) { discard; }
  let shape = u.params.z;
  if (shape > 0.5) {
    let c = pc - vec2f(0.5);
    if (dot(c, c) > 0.25) { discard; }
  }
  return vec4f(in.color.rgb, 1.0);
}
`;

const MODE_INDEX: Record<string, number> = {
  rgb: 0,
  class: 1,
  height: 2,
  intensity: 3,
  power_highlight: 4,
  danger: 5,
};

export class WebGPUPointCloudRenderer {
  private device: any;
  private context: any;
  private canvas: HTMLCanvasElement;
  private format: string;

  private uniformBuffer: any;
  private srcPosBuffer: any;
  private srcColorBuffer: any;
  private srcClassBuffer: any;
  private dstIndexBuffer: any;
  private indirectBuffer: any;
  private bindGroup: any;
  private computePipeline: any;
  private renderPipeline: any;
  private bindGroupLayout: any;

  private uniformsData: ArrayBuffer;
  private total: number;
  private maxVisible: number;
  private stride: number;
  private style: WebGPUPointCloudStyle;
  private viewProj = new THREE.Matrix4();
  private cameraPos = new THREE.Vector3();
  private disposed = false;

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  }

  static async create(
    canvas: HTMLCanvasElement,
    data: WebGPUPointCloudData,
    style: WebGPUPointCloudStyle
  ): Promise<WebGPUPointCloudRenderer> {
    const gpu = (navigator as any).gpu as any;
    if (!gpu) throw new Error('WebGPU not supported');
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('WebGPU adapter unavailable');
    const device = await adapter.requestDevice();
    const format = gpu.getPreferredCanvasFormat();
    const context = canvas.getContext('webgpu') as any;
    if (!context) throw new Error('webgpu canvas context unavailable');
    context.configure({ device, format, alphaMode: 'premultiplied' });
    return new WebGPUPointCloudRenderer(device, context, canvas, format, data, style);
  }

  private constructor(
    device: any,
    context: any,
    canvas: HTMLCanvasElement,
    format: string,
    data: WebGPUPointCloudData,
    style: WebGPUPointCloudStyle
  ) {
    this.device = device;
    this.context = context;
    this.canvas = canvas;
    this.format = format;
    this.style = { ...style };
    this.total = data.pointCount;
    this.uniformsData = new ArrayBuffer(UNIFORM_SIZE);

    const { maxVisible, stride } = this.computeBudget();
    this.maxVisible = maxVisible;
    this.stride = stride;

    const colorArray = new Float32Array(this.total * 4);
    for (let i = 0; i < this.total; i++) {
      const i4 = i * 4;
      const i3 = i * 3;
      if (data.colors && data.colors.length >= i3 + 3) {
        colorArray[i4] = data.colors[i3];
        colorArray[i4 + 1] = data.colors[i3 + 1];
        colorArray[i4 + 2] = data.colors[i3 + 2];
      }
      colorArray[i4 + 3] = data.intensities[i] ?? 0.5;
    }
    const classArray = new Uint32Array(this.total);
    for (let i = 0; i < this.total; i++) classArray[i] = data.classIds[i];

    const posCopy = new Float32Array(this.total * 3);
    posCopy.set(data.positions.subarray(0, this.total * 3));
    this.srcPosBuffer = this.makeBuffer('srcPos', posCopy.buffer, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    this.srcColorBuffer = this.makeBuffer('srcColor', colorArray.buffer, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    this.srcClassBuffer = this.makeBuffer('srcClass', classArray.buffer, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    this.dstIndexBuffer = device.createBuffer({
      size: this.maxVisible * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.indirectBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });
    this.uniformBuffer = device.createBuffer({
      size: UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shaderModule = device.createShaderModule({ code: WGSL });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });

    this.computePipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: 'main' },
    });
    this.renderPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs' },
      primitive: { topology: 'point-list' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [{ format }],
      },
    });

    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.srcPosBuffer } },
        { binding: 2, resource: { buffer: this.srcColorBuffer } },
        { binding: 3, resource: { buffer: this.srcClassBuffer } },
        { binding: 4, resource: { buffer: this.dstIndexBuffer } },
        { binding: 5, resource: { buffer: this.indirectBuffer } },
      ],
    });

    this.updateUniforms();
  }

  private makeBuffer(name: string, data: ArrayBuffer, usage: number): any {
    const buffer = this.device.createBuffer({ size: data.byteLength, usage });
    this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  private computeBudget(): { maxVisible: number; stride: number } {
    const total = this.total;
    const targetBudget = Math.min(total, this.style.pointBudget);
    const densityStride = Math.max(1, Math.floor(100 / Math.max(1, this.style.pointDensity)));
    const budgetStride = Math.max(1, Math.floor(total / Math.max(1, targetBudget)));
    const stride = Math.max(densityStride, budgetStride);
    const maxVisible = Math.ceil(total / stride);
    return { maxVisible, stride };
  }

  setStyle(style: Partial<WebGPUPointCloudStyle>) {
    this.style = { ...this.style, ...style };
    const { maxVisible, stride } = this.computeBudget();
    if (maxVisible !== this.maxVisible || stride !== this.stride) {
      this.maxVisible = maxVisible;
      this.stride = stride;
      this.dstIndexBuffer.destroy();
      this.dstIndexBuffer = this.device.createBuffer({
        size: this.maxVisible * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.bindGroup = this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.srcPosBuffer } },
          { binding: 2, resource: { buffer: this.srcColorBuffer } },
          { binding: 3, resource: { buffer: this.srcClassBuffer } },
          { binding: 4, resource: { buffer: this.dstIndexBuffer } },
          { binding: 5, resource: { buffer: this.indirectBuffer } },
        ],
      });
    }
    this.updateUniforms();
  }

  updateClassData(classIds: Uint8Array) {
    const arr = new Uint32Array(this.total);
    const n = Math.min(this.total, classIds.length);
    for (let i = 0; i < n; i++) arr[i] = classIds[i];
    this.device.queue.writeBuffer(this.srcClassBuffer, 0, arr);
  }

  setCamera(projection: THREE.Matrix4, viewInverse: THREE.Matrix4, position: THREE.Vector3) {
    this.viewProj.multiplyMatrices(projection, viewInverse);
    this.cameraPos.copy(position);
    this.updateUniforms();
  }

  resize(width: number, height: number, dpr: number) {
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });
  }

  private updateUniforms() {
    const view = new DataView(this.uniformsData);
    const f32 = new Float32Array(this.uniformsData);
    const u32 = new Uint32Array(this.uniformsData);

    for (let i = 0; i < 16; i++) f32[i] = this.viewProj.elements[i];
    f32[16] = this.cameraPos.x;
    f32[17] = this.cameraPos.y;
    f32[18] = this.cameraPos.z;
    f32[19] = 1;

    f32[20] = this.style.pointSize;
    f32[21] = this.style.maxPointSize;
    f32[22] = this.style.pointShape === 'square' ? 0 : 1;
    f32[23] = MODE_INDEX[this.style.colorMode] ?? 4;

    f32[24] = this.style.spanZ > 0 ? this.style.spanZ : 35;
    f32[25] = this.style.dangerHeight;
    f32[26] = this.style.hasColor ? 1 : 0;
    f32[27] = 0;

    u32[28] = this.total;
    u32[29] = this.stride;
    u32[30] = this.maxVisible;
    u32[31] = 0;

    for (let c = 0; c < 32; c++) {
      const o = 32 + c * 4;
      f32[o] = this.style.classColors[c * 4] ?? 0.6;
      f32[o + 1] = this.style.classColors[c * 4 + 1] ?? 0.65;
      f32[o + 2] = this.style.classColors[c * 4 + 2] ?? 0.98;
      f32[o + 3] = this.style.classColors[c * 4 + 3] ?? 1;
    }

    let mask = 0;
    for (const c of this.style.visibleClasses) {
      if (c >= 0 && c <= 31) mask |= 1 << c;
    }
    u32[160] = mask >>> 0;
    u32[161] = 0;
    u32[162] = 0;
    u32[163] = 0;
    void view;
  }

  render() {
    if (this.disposed) return;
    const device = this.device;
    device.queue.writeBuffer(this.indirectBuffer, 0, new Uint32Array([0, 1, 0, 0]));
    device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformsData);

    const encoder = device.createCommandEncoder();
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.bindGroup);
    computePass.dispatchWorkgroups(Math.ceil(this.maxVisible / 256));
    computePass.end();

    const colorAttachment = {
      view: this.context.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: 'clear',
      storeOp: 'store',
    } as any;
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [colorAttachment],
    });
    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.drawIndirect(this.indirectBuffer, 0);
    renderPass.end();
    device.queue.submit([encoder.finish()]);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const b of [
      this.uniformBuffer,
      this.srcPosBuffer,
      this.srcColorBuffer,
      this.srcClassBuffer,
      this.dstIndexBuffer,
      this.indirectBuffer,
    ]) {
      if (b) b.destroy();
    }
  }
}
