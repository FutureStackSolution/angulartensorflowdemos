/**
 * Configuration interface for pupil concentration tracker
 */
export interface PupilTrackerConfig {
  frameRate: number;
  smoothingFactor: number;
  sensitivity: number;
  calibrationFrames: number;
  maxHistorySize: number;
  minPupilSize: number;
  maxPupilSize: number;
}

/**
 * Concentration metrics interface
 */
export interface ConcentrationMetrics {
  level: number;
  leftPupilSize: number;
  rightPupilSize: number;
  averagePupilSize: number;
  dilationRatio: number;
  stability: number;
  isCalibrated: boolean;
  calibrationProgress: number;
}

/**
 * Pupil measurement interface
 */
export interface PupilMeasurement {
  leftPupil: {
    center: { x: number; y: number };
    radius: number;
    confidence: number;
  };
  rightPupil: {
    center: { x: number; y: number };
    radius: number;
    confidence: number;
  };
  timestamp: number;
}

/**
 * Calibration data interface
 */
export interface CalibrationData {
  baselineLeftPupil: number;
  baselineRightPupil: number;
  leftPupilVariations: number[];
  rightPupilVariations: number[];
  calibrationComplete: boolean;
  calibrationStartTime: number;
}
