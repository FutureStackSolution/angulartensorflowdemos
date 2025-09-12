/**
 * Configuration interface for object detection component
 */
export interface DetectionConfig {
  threshold: number;
  maxDetections: number;
  frameRate: number;
  modelType: 'mobilenet_v2' | 'lite_mobilenet_v2';
}

/**
 * Detection statistics interface
 */
export interface DetectionStats {
  currentDetectionCount: number;
  detectionFrames: number;
  lastFpsTime: number;
  currentFps: number;
}

/**
 * Detection result interface
 */
export interface DetectionResult {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}
