/**
 * Common interfaces used across the application
 */

/**
 * Application state interface
 */
export interface AppState {
  isLoading: boolean;
  errorMessage: string;
  isInitialized: boolean;
}

/**
 * Camera configuration interface
 */
export interface CameraConfig {
  width: number;
  height: number;
  frameRate: number;
  facingMode: 'user' | 'environment';
}

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  cpuUsage: number;
}

/**
 * UI configuration interface
 */
export interface UIConfig {
  theme: 'light' | 'dark';
  showDebugInfo: boolean;
  enableAnimations: boolean;
  language: string;
}
