import { Component, ElementRef, ViewChild, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

// TensorFlow.js imports
import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';

// Model imports
import { PupilTrackerConfig, ConcentrationMetrics, PupilMeasurement, CalibrationData } from '../models';


@Component({
  selector: 'app-pupil-concentration-tracker',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatProgressBarModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './pupil-concentration-tracker.component.html',
  styleUrls: ['./pupil-concentration-tracker.component.css']
})
export class PupilConcentrationTrackerComponent implements OnInit, OnDestroy {

  @ViewChild('video') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvasElement!: ElementRef<HTMLCanvasElement>;
  
  // Public properties for UI binding
  concentrationLevel: number = 0; 
  leftPupilSize: number = 0; 
  rightPupilSize: number = 0; 
  isTracking: boolean = false;
  isCalibrated: boolean = false;
  isLoading: boolean = false;
  isModelLoaded: boolean = false;
  errorMessage: string = '';
  calibrationProgress: number = 0;
  
  // Enhanced metrics for better UI
  metrics: ConcentrationMetrics = {
    level: 0,
    leftPupilSize: 0,
    rightPupilSize: 0,
    averagePupilSize: 0,
    dilationRatio: 1.0,
    stability: 0,
    isCalibrated: false,
    calibrationProgress: 0
  };

  // Private properties for internal state management
  private detector: faceLandmarksDetection.FaceLandmarksDetector | null = null;
  private stream: MediaStream | null = null;
  private animationId: number = 0;
  private lastDetectionTime = 0;
  private baselinePupilSize = 0;
  private pupilSizeHistory: number[] = [];
  private faceDetectionCount = 0;
  private lastValidPupilSizes = { left: 0, right: 0 };

  // Optimized configuration
  private config: PupilTrackerConfig = {
    frameRate: 30,
    smoothingFactor: 0.3,
    sensitivity: 2.0,
    calibrationFrames: 30,
    maxHistorySize: 100,
    minPupilSize: 2,
    maxPupilSize: 50
  };

  // Legacy settings for backward compatibility
  settings = {
    sensitivity: 2,
    smoothing: 3,
    threshold: 100
  };
  
  constructor(
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar
  ) {}
  
  async ngOnInit() {
    // Model will be loaded when user clicks "Start Tracking"
  }
  
  ngOnDestroy() {
    this.stopTracking();
  }

  /**
   * Load the face detection model. This method is called once when the component is initialized.
   * It waits for TensorFlow to be ready, and then loads the MediaPipe Face Mesh model with
   * the refineLandmarks option enabled. If the model is loaded successfully, it logs a success
   * message to the console. If there is an error, it logs the error message to the console.
   * @returns {Promise<void>}
   */
  async loadModel() {
    try {
      this.isLoading = true;
      this.errorMessage = '';
      this.cdr.detectChanges();

      console.log('Loading face detection model...');
      await tf.ready();

      const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;

      const detectorConfig: faceLandmarksDetection.MediaPipeFaceMeshMediaPipeModelConfig = {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
        refineLandmarks: true
      };

      this.detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
      this.isModelLoaded = true;
      console.log('Model loaded successfully');
    } catch (error) {
      console.error('Error loading model:', error);
      this.errorMessage = 'Failed to load face detection model. Please refresh the page.';
      this.showMessage(this.errorMessage, 'error');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Start tracking the user's face and pupil movements using the user's
   * webcam. This function is called when the user clicks the "Start
   * Tracking" button.
   * @returns {Promise<void>}
   */
  
  async startTracking() {
    if (!this.detector) {
      await this.loadModel();
    }
    
    if (!this.detector) {
      return;
    }

    try {
      // Optimized camera constraints for better performance
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: this.config.frameRate, max: 30 },
          facingMode: 'user'
        }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      const video = this.videoElement.nativeElement;
      video.srcObject = this.stream;

      video.onloadedmetadata = () => {
        video.play();
        this.isTracking = true;
        this.resetCalibration();
        this.startDetection();
        this.showMessage('Tracking started successfully!', 'success');
      };
    } catch (error) {
      console.error('Error accessing webcam:', error);
      this.showMessage('Unable to access camera. Please ensure camera permissions are granted.', 'error');
    }
  }

  /**
   * Start face detection and process the results. This function is called
   * recursively using requestAnimationFrame to continuously detect faces
   * and update the metrics.
   * @returns {Promise<void>}
   */
  async startDetection() {
    if (!this.detector || !this.isTracking) return;

    const now = performance.now();
    const timeSinceLastDetection = now - this.lastDetectionTime;
    const targetInterval = 1000 / this.config.frameRate;

    // Frame rate limiting for better performance
    if (timeSinceLastDetection < targetInterval) {
      this.animationId = requestAnimationFrame(() => this.startDetection());
      return;
    }

    this.lastDetectionTime = now;

    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const ctx = canvas.getContext('2d');

    if (!ctx || !video.videoWidth || video.readyState !== video.HAVE_ENOUGH_DATA) {
      this.animationId = requestAnimationFrame(() => this.startDetection());
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    try {
      const faces = await this.detector.estimateFaces(video, { flipHorizontal: true });

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (faces && faces.length > 0) {
        this.faceDetectionCount++;
        this.processFaceDetection(ctx, faces[0]);
      } else {
        this.resetCurrentMetrics();
      }
    } catch (error) {
      console.error('Detection error:', error);
      this.showMessage('Detection error occurred', 'error');
    }

    this.animationId = requestAnimationFrame(() => this.startDetection());
  }

  /**
   * Process the face detection result, drawing the face box and calculating the
   * pupil sizes. If the pupil sizes are both valid, draw the eye indicators and
   * update the concentration level. If not, decay the concentration level.
   * @param ctx The canvas 2D drawing context.
   * @param face The face detection result.
   */
  processFaceDetection(ctx: CanvasRenderingContext2D, face: any) {
    if (!face.keypoints) return;

    const leftEyeOpen = this.isEyeOpen(face.keypoints, 'left');
    const rightEyeOpen = this.isEyeOpen(face.keypoints, 'right');

    if (!leftEyeOpen || !rightEyeOpen) {
      this.resetCurrentMetrics();
      return;
    }

    this.drawFaceBox(ctx, face);
    this.leftPupilSize = this.calculatePupilSize(face.keypoints, 'left');
    this.rightPupilSize = this.calculatePupilSize(face.keypoints, 'right');

    if (this.leftPupilSize > 0 && this.rightPupilSize > 0) {
      // We can only draw eye indicators if we have the eye regions.
      const leftEye = this.extractEyeRegion(face.keypoints, 'left');
      const rightEye = this.extractEyeRegion(face.keypoints, 'right');
      if (leftEye && rightEye) {
        this.drawEyeIndicators(ctx, leftEye, rightEye);
      }
      this.updateConcentration();
    } else {
      // Can't see pupils, decay concentration.
      this.concentrationLevel = this.smoothValue(this.concentrationLevel, 0);
    }
  }

  /**
   * Extract the keypoints for a given eye region from a list of detected keypoints.
   * @param keypoints The list of keypoints to extract from.
   * @param eye The eye to extract keypoints for (either 'left' or 'right').
   * @returns An array of keypoints for the specified eye, or null if the extraction fails.
   */
  extractEyeRegion(keypoints: any[], eye: 'left' | 'right'): any[] | null {
    try {
      const leftEyeIndices = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
      const rightEyeIndices = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

      const indices = eye === 'left' ? leftEyeIndices : rightEyeIndices;

      return indices.map(i => keypoints[i]).filter(Boolean);
    } catch (error) {
      console.error('Error extracting eye region:', error);
      return null;
    }
  }

  /**
   * Determine if an eye is open or closed by looking at the aspect ratio of the eye.
   * This is done by comparing the vertical distance between the upper and lower eyelids
   * to the horizontal distance between the left and right eye corners.
   * If the aspect ratio is greater than a certain threshold (empirically set to 0.1),
   * we assume the eye is open.
   * If the eye corners are missing, or if the horizontal distance is zero (which would
   * cause a division by zero error), we return false.
   * @param keypoints The list of keypoints for the face.
   * @param side The side of the face to check (either 'left' or 'right').
   */
  isEyeOpen(keypoints: any[], side: 'left' | 'right'): boolean {
    if (!keypoints || keypoints.length < 478) return false;

    // Using keypoints for upper and lower eyelids and eye corners
    const eyeLidIndices = side === 'left' 
        ? { top: 159, bottom: 145, leftCorner: 33, rightCorner: 133 }
        : { top: 386, bottom: 374, leftCorner: 362, rightCorner: 263 };

    const topLid = keypoints[eyeLidIndices.top];
    const bottomLid = keypoints[eyeLidIndices.bottom];
    const leftCorner = keypoints[eyeLidIndices.leftCorner];
    const rightCorner = keypoints[eyeLidIndices.rightCorner];

    if (!topLid || !bottomLid || !leftCorner || !rightCorner) {
        return false; // Can't determine if eye is open if landmarks are missing
    }

    const verticalDist = Math.hypot(topLid.x - bottomLid.x, topLid.y - bottomLid.y);
    const horizontalDist = Math.hypot(leftCorner.x - rightCorner.x, leftCorner.y - rightCorner.y);

    if (horizontalDist === 0) return false;

    const eyeAspectRatio = verticalDist / horizontalDist;

    // This threshold is empirical. A value around 0.1 is common for closed eyes.
    return eyeAspectRatio > 0.1;
  }

  
  
  /**
   * Calculates the pupil size (diameter in pixels) for a given eye by using the
   * iris landmarks from the MediaPipeFaceMesh model. The landmarks are only available
   * when the model is loaded with the `refineLandmarks: true` option.
   * @param keypoints The keypoints detected by the model.
   * @param side The side of the face to calculate the pupil size for (either 'left' or 'right').
   * @returns The pupil diameter in pixels, or 0 if not all iris points are detected.
   */
  calculatePupilSize(keypoints: any[], side: 'left' | 'right'): number {
    // The MediaPipeFaceMesh model with `refineLandmarks: true` returns 478 keypoints.
    // The iris landmarks are only available with this setting.
    if (!keypoints || keypoints.length < 478) return 0;

    const irisIndices = side === 'left' 
        ? { top: 474, bottom: 476, left: 477, right: 475 } 
        : { top: 469, bottom: 471, left: 472, right: 470 };

    const top = keypoints[irisIndices.top];
    const bottom = keypoints[irisIndices.bottom];
    const left = keypoints[irisIndices.left];
    const right = keypoints[irisIndices.right];

    if (!top || !bottom || !left || !right) {
        return 0; // Not all iris points detected
    }

    const verticalDist = Math.hypot(top.x - bottom.x, top.y - bottom.y);
    const horizontalDist = Math.hypot(left.x - right.x, left.y - right.y);

    // Average of vertical and horizontal distances as pupil diameter in pixels
    return (verticalDist + horizontalDist) / 2;
  }

  /**
   * Updates the concentration level based on the latest pupil sizes.
   * It will automatically calibrate the baseline pupil size after 30 frames of valid data.
   * The concentration level is a score from 0-100 based on pupil dilation and stability.
   * The score is calculated as follows:
   * 1. Dilation score (0-60 points): Maps the dilation ratio to a score, with a ratio of 1.0
   *    giving a medium score and a ratio of ~1.15 giving a high score.
   * 2. Stability score (0-40 points): Maps the pupil size variability to a score, with a
   *    variability of 0 giving a high score and a variability of 1 giving a low score.
   * 3. Combine scores and clamp to 0-100.
   */
  updateConcentration() {
    const averagePupilSize = (this.leftPupilSize + this.rightPupilSize) / 2;
    
    // Validate pupil size
    if (averagePupilSize <= 0 || averagePupilSize < this.config.minPupilSize || averagePupilSize > this.config.maxPupilSize) {
      this.concentrationLevel = this.smoothValue(this.concentrationLevel, 0);
      this.updateMetrics();
      return;
    }

    // Add to history with size limits
    this.pupilSizeHistory.push(averagePupilSize);
    if (this.pupilSizeHistory.length > this.config.maxHistorySize) {
      this.pupilSizeHistory.shift();
    }

    // Update calibration progress
    this.calibrationProgress = Math.min(100, (this.pupilSizeHistory.length / this.config.calibrationFrames) * 100);

    // Auto-calibration
    if (!this.isCalibrated && this.pupilSizeHistory.length >= this.config.calibrationFrames) {
      const validHistory = this.pupilSizeHistory
        .slice(0, this.config.calibrationFrames)
        .filter(s => s > this.config.minPupilSize && s < this.config.maxPupilSize);
      
      if (validHistory.length >= this.config.calibrationFrames * 0.5) {
        this.baselinePupilSize = validHistory.reduce((a, b) => a + b, 0) / validHistory.length;
        this.isCalibrated = true;
        this.metrics.isCalibrated = true;
        this.showMessage('Calibration complete! Tracking concentration levels.', 'success');
        this.cdr.detectChanges();
      }
    }

    if (this.isCalibrated && this.baselinePupilSize > 0) {
      const dilationRatio = averagePupilSize / this.baselinePupilSize;
      const variability = this.calculatePupilVariability();
      const stability = this.calculateStability();

      // Enhanced concentration calculation
      const concentrationScore = this.calculateConcentrationScore(dilationRatio, variability, stability);
      
      this.concentrationLevel = this.smoothValue(this.concentrationLevel, concentrationScore);
      this.updateMetrics(dilationRatio, stability);
    } else {
      // Not calibrated yet
      this.updateMetrics();
    }
  }

  private calculateConcentrationScore(dilationRatio: number, variability: number, stability: number): number {
    // 1. Dilation Score (0-60 points) - More sophisticated curve
    let dilationScore = 0;
    if (dilationRatio >= 1.0) {
      // Peak concentration at 1.1-1.2 dilation ratio
      const optimalRange = Math.min(1, Math.max(0, (dilationRatio - 1.0) / 0.2));
      dilationScore = 40 + optimalRange * 20; // 40-60 points
    } else {
      // Decreased concentration for constricted pupils
      const constriction = (1.0 - Math.max(0.7, dilationRatio)) / 0.3;
      dilationScore = 40 - constriction * 40; // 0-40 points
    }

    // 2. Stability Score (0-30 points) - Based on recent stability
    const stabilityScore = Math.max(0, (1 - Math.min(1, variability * this.config.sensitivity)) * 30);

    // 3. Focus Score (0-10 points) - Based on overall stability trend
    const focusScore = Math.max(0, stability * 10);

    // Combine and clamp
    const totalScore = dilationScore + stabilityScore + focusScore;
    return Math.max(0, Math.min(100, totalScore));
  }

  private updateMetrics(dilationRatio: number = 1.0, stability: number = 0) {
    this.metrics.level = this.concentrationLevel;
    this.metrics.leftPupilSize = this.leftPupilSize;
    this.metrics.rightPupilSize = this.rightPupilSize;
    this.metrics.averagePupilSize = (this.leftPupilSize + this.rightPupilSize) / 2;
    this.metrics.dilationRatio = dilationRatio;
    this.metrics.stability = stability;
    this.metrics.isCalibrated = this.isCalibrated;
  }
  
  /**
   * Calculates the pupil size variability over the last 10 samples.
   * If there are fewer than 10 samples, returns 0.
   * The variability is the square root of the variance of the pupil sizes,
   * divided by the mean pupil size.
   * The result is clamped to be no larger than 1.
   * @return The pupil size variability, between 0 and 1.
   */
  calculatePupilVariability(): number {
    if (this.pupilSizeHistory.length < 10) return 0;
    const recent = this.pupilSizeHistory.slice(-10);
    const mean = recent.reduce((a, b) => a + b) / recent.length;
    const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
    return Math.min(1, Math.sqrt(variance) / mean);
  }

  private calculateStability(): number {
    if (this.pupilSizeHistory.length < 20) return 0;
    const recent = this.pupilSizeHistory.slice(-20);
    const mean = recent.reduce((a, b) => a + b) / recent.length;
    const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
    const stability = Math.max(0, 1 - Math.sqrt(variance) / mean);
    return Math.min(1, stability);
  }

  /**
   * Smooths a value over time, by blending it with a new value.
   * The smoothing factor is between 0 and 1, where 0 means only the new value is used,
   * and 1 means the current value is kept unchanged.
   * @param currentValue The current value to be smoothed.
   * @param newValue The new value to be blended in.
   * @return The smoothed value.
   */
  smoothValue(currentValue: number, newValue: number): number {
    const smoothingFactor = this.config.smoothingFactor;
    return currentValue * smoothingFactor + newValue * (1 - smoothingFactor);
  }

  /**
   * Draws a green box around the detected face, to help illustrate the tracking.
   * @param ctx The canvas context to draw on.
   * @param face The face object from the face detection model, containing the box coordinates.
   */
  drawFaceBox(ctx: CanvasRenderingContext2D, face: any) {
    if (!face.box) return;
    const { xMin, yMin, width, height } = face.box;
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(xMin, yMin, width, height);
  }

  /**
   * Draws a small circle at the center of each detected eye, to help illustrate which
   * points are being used to calculate the pupil size. Red for the left eye, green for
   * the right eye.
   * @param ctx The canvas context to draw on.
   * @param leftEye An array of points representing the left eye, if detected.
   * @param rightEye An array of points representing the right eye, if detected.
   */
  drawEyeIndicators(ctx: CanvasRenderingContext2D, leftEye: any[], rightEye: any[]) {
    ctx.fillStyle = '#ff6b6b';
    if (leftEye.length > 0) {
      ctx.beginPath();
      ctx.arc(leftEye[0].x, leftEye[0].y, 3, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.fillStyle = '#4ecdc4';
    if (rightEye.length > 0) {
      ctx.beginPath();
      ctx.arc(rightEye[0].x, rightEye[0].y, 3, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  
  /**
   * Resets the current pupil sizes and concentration level to zero.
   * This is called when the face detection is lost, or when the user
   * manually stops tracking.
   */
  resetCurrentMetrics() {
    this.leftPupilSize = 0;
    this.rightPupilSize = 0;
    this.concentrationLevel=0;
    this.concentrationLevel = this.smoothValue(this.concentrationLevel, 0);
  }

  /**
   * Resets the baseline pupil size to the current average pupil size, 
   * and resets the concentration level to zero. This is useful if the user
   * wants to reset the baseline pupil size to the current state of their
   * eyes, or if the concentration level has become desensitized over time.
   * Has no effect if the tracker is not currently active.
   */
  recalibrate() {
    if (!this.isTracking) return;
    console.log('Recalibrating...');
    this.resetCalibration();
    this.showMessage('Recalibrating... Please look at the camera.', 'info');
  }

  private resetCalibration() {
    this.isCalibrated = false;
    this.metrics.isCalibrated = false;
    this.baselinePupilSize = 0;
    this.pupilSizeHistory = [];
    this.calibrationProgress = 0;
    this.concentrationLevel = 0;
    this.faceDetectionCount = 0;
  }

  /**
   * Stops the eye tracker and resets all metrics and state.
   * Called automatically when the user stops the tracker, or
   * when the component is destroyed.
   */
  stopTracking() {
    // Cancel animation frame
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }

    // Stop camera stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Clear video and canvas
    if (this.videoElement?.nativeElement) {
      this.videoElement.nativeElement.srcObject = null;
    }

    if (this.canvasElement?.nativeElement) {
      const context = this.canvasElement.nativeElement.getContext('2d');
      if (context) {
        context.clearRect(0, 0, this.canvasElement.nativeElement.width, this.canvasElement.nativeElement.height);
      }
    }

    this.isTracking = false;
    this.resetCurrentMetrics();
    this.resetCalibration();
    this.showMessage('Tracking stopped', 'info');
  }

  private showMessage(message: string, type: 'success' | 'error' | 'info' = 'info') {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: [`snackbar-${type}`]
    });
  }

  // Public methods for configuration
  updateSensitivity(sensitivity: number) {
    this.config.sensitivity = Math.max(0.1, Math.min(5.0, sensitivity));
    this.settings.sensitivity = Math.round(sensitivity);
  }

  updateSmoothing(smoothing: number) {
    this.config.smoothingFactor = Math.max(0.1, Math.min(0.9, smoothing / 10));
    this.settings.smoothing = Math.round(smoothing);
  }

  updateFrameRate(frameRate: number) {
    this.config.frameRate = Math.max(15, Math.min(60, frameRate));
  }

  getConfig() {
    return { ...this.config };
  }

  getMetrics() {
    return { ...this.metrics };
  }

  
  
  

  
  
}