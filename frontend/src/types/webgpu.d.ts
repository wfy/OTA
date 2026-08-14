// Minimal ambient declarations for WebGPU globals used by the compute renderer.
// The GPU* objects are intentionally typed as `any` in the renderer bridge.
declare const GPUBufferUsage: {
  STORAGE: number;
  COPY_DST: number;
  UNIFORM: number;
  INDIRECT: number;
};

declare const GPUShaderStage: {
  COMPUTE: number;
  VERTEX: number;
  FRAGMENT: number;
};
