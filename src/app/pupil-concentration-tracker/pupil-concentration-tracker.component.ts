import { Component, ElementRef, ViewChild, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';

// TensorFlow.js imports
import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';


@Component({
  selector: 'app-pupil-concentration-tracker',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatProgressBarModule,
    MatIconModule
  ],
  templateUrl: './pupil-concentration-tracker.component.html',
  styleUrls: ['./pupil-concentration-tracker.component.css']
})
export class PupilConcentrationTrackerComponent implements OnInit, OnDestroy {

  @ViewChild('video') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvasElement!: ElementRef<HTMLCanvasElement>;
  
  concentrationLevel: number = 0; 
  leftPupilSize: number = 0; 
  rightPupilSize: number =0; 
  isTracking: boolean = false;
  
  isCalibrated: boolean = false;
  // New detector instead of old model
  private detector: faceLandmarksDetection.FaceLandmarksDetector | null = null;
  private stream: MediaStream | null = null;
  private animationId: number = 0;
  private baselinePupilSize = 0;
  private pupilSizeHistory: number[] = [];


  settings = {
    sensitivity: 2,
    smoothing: 3,
    threshold: 100
  };
  
  constructor() {}
  
  async ngOnInit() {
    await this.loadModel();
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
      console.log('Loading face detection model...');
      await tf.ready();

      const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;

      const detectorConfig: faceLandmarksDetection.MediaPipeFaceMeshMediaPipeModelConfig = {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
        refineLandmarks: true
      };

      this.detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
      console.log('Model loaded successfully');
    } catch (error) {
      console.error('Error loading model:', error);
    }
  }

  /**
   * Start tracking the user's face and pupil movements using the user's
   * webcam. This function is called when the user clicks the "Start
   * Tracking" button.
   * @returns {Promise<void>}
   */
  
  async startTracking() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });

      const video = this.videoElement.nativeElement;
      video.srcObject = this.stream;

      video.onloadedmetadata = () => {
        video.play();
        this.isTracking = true;
        this.startDetection();
      };
    } catch (error) {
      console.error('Error accessing webcam:', error);
      alert('Unable to access camera. Please ensure camera permissions are granted.');
    }
  }

  /**
   * Start face detection and process the results. This function is called
   * recursively using requestAnimationFrame to continuously detect faces
   * and update the metrics.
   * @returns {Promise<void>}
   */
  async startDetection() {
    if (!this.detector || !this.startTracking) return;

    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const ctx = canvas.getContext('2d');

    if (!ctx || !video.videoWidth) {
      this.animationId = requestAnimationFrame(() => this.startDetection());
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    try {
      const faces = await this.detector.estimateFaces(video, { flipHorizontal: true });

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (faces && faces.length > 0) {
        this.processFaceDetection(ctx, faces[0]);
      } else {
        this.resetCurrentMetrics();
      }
    } catch (error) {
      console.error('Detection error:', error);
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
   * Calculate the pupil size (diameter) in mm from the keypoints of one eye.
   * The calculation uses the iris points (474, 476, 477, 475 for left eye and 469, 471, 472, 470 for right eye)
   * and the horizontal distance between the eye corners (33, 133 for left eye and 362, 263 for right eye) as a reference.
   * The pupil size is estimated by averaging the vertical and horizontal distances of the iris points.
   * The result is then converted from pixels to mm using the reference eye width.
   * The result is clamped to a reasonable range of 1.5 to 9.0 mm to avoid noise.
   * @param keypoints The keypoints of the face mesh.
   * @param side The side of the face (left or right).
   * @returns The estimated pupil size in mm.
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
    if (averagePupilSize <= 0) {
      this.concentrationLevel = this.smoothValue(this.concentrationLevel, 0);
      return;
    }

    this.pupilSizeHistory.push(averagePupilSize);
    if (this.pupilSizeHistory.length > 100) this.pupilSizeHistory.shift();

    if (!this.isCalibrated && this.pupilSizeHistory.length >= 30) {
      // Filter out any zeros that might have slipped in, just in case.
      const validHistory = this.pupilSizeHistory.slice(0, 30).filter(s => s > 0);
      if (validHistory.length > 15) { // require at least 15 valid samples
        this.baselinePupilSize = validHistory.reduce((a, b) => a + b, 0) / validHistory.length;
        this.isCalibrated = true;
      }
    }

    if (this.isCalibrated && this.baselinePupilSize > 0) {
      const dilationRatio = averagePupilSize / this.baselinePupilSize;
      const variability = this.calculatePupilVariability();

      // --- New, more intuitive formula ---
      // We'll calculate a score from 0-100 based on pupil dilation and stability.
      // Dilation can indicate cognitive load, and stability can indicate focus.

      // 1. Dilation Score (0-80 points)
      // We assume peak concentration happens with a slight pupil dilation (e.g., 10-25% larger).
      // A dilation ratio around 1.0 is neutral. Ratios below indicate less focus, above indicate more.
      // We'll use a non-linear mapping to better represent this.
      let dilationScore = 0;
      if (dilationRatio >= 1.0) {
        // Score increases as dilation goes from 1.0 up to a max of around 1.25
        // A ratio of 1.0 (no change) is now considered moderately focused.
        const effect = Math.min(1, (dilationRatio - 1.0) / 0.30); // Normalize effect range 1.0 -> 1.30
        dilationScore = 50 + effect * 30; // Base score of 50, up to 80
      } else {
        // Score decreases as dilation goes from 1.0 down to 0.8
        // A constricted pupil suggests lower concentration.
        const effect = (1.0 - Math.max(0.75, dilationRatio)) / 0.25; // Normalize effect range 1.0 -> 0.75
        dilationScore = 50 - effect * 50; // Decrease from base score of 50
      }

      // 2. Stability Score (0-20 points)
      // Less variability (more stable pupil size) indicates higher focus.
      // A variability of 0 is perfect stability, and 1 is max instability.
      const stabilityScore = (1 - Math.min(1, variability * this.settings.sensitivity)) * 20;

      // 3. Combine scores and clamp
      let concentrationScore = dilationScore + stabilityScore;
      concentrationScore = Math.max(0, Math.min(100, concentrationScore)); // Clamp to 0-100

      this.concentrationLevel = this.smoothValue(this.concentrationLevel, concentrationScore);
    } else {
      // Not calibrated yet, or bad calibration data.
      // The UI will show the initial value of 0.
    }
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

  /**
   * Smooths a value over time, by blending it with a new value.
   * The smoothing factor is between 0 and 1, where 0 means only the new value is used,
   * and 1 means the current value is kept unchanged.
   * @param currentValue The current value to be smoothed.
   * @param newValue The new value to be blended in.
   * @return The smoothed value.
   */
  smoothValue(currentValue: number, newValue: number): number {
    const smoothingFactor = this.settings.smoothing / 10;
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
    this.isCalibrated = false;
    this.baselinePupilSize = 0;
    this.pupilSizeHistory = []; // Start collecting fresh data for a new baseline
    this.concentrationLevel = 0; // Reset concentration during recalibration
  }

  /**
   * Stops the eye tracker and resets all metrics and state.
   * Called automatically when the user stops the tracker, or
   * when the component is destroyed.
   */
  stopTracking() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }

    this.isTracking = false;
    this.resetCurrentMetrics();
    this.recalibrate(); // Also reset calibration state on stop
  }

  
  
  

  
  
}