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
  private calibrationData: number[] = [];
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
    const diameterInPixels = (verticalDist + horizontalDist) / 2;

    // To get a measurement in mm, we need a reference object with a known real-world size.
    // The horizontal distance between the eye corners is a good candidate.
    // The average human eye horizontal visible diameter is about 28-30mm.
    const eyeCornerIndices = side === 'left' ? { p1: 33, p2: 133 } : { p1: 362, p2: 263 };
    const p1 = keypoints[eyeCornerIndices.p1];
    const p2 = keypoints[eyeCornerIndices.p2];

    if (!p1 || !p2) {
        return 0;
    }

    const eyeWidthPixels = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    
    if (eyeWidthPixels === 0) return 0;

    // This is an estimation. A more robust solution would involve a proper calibration step.
    const PIXELS_PER_MM_ESTIMATE = eyeWidthPixels / 28.0; // Assuming horizontal eye width is ~28mm

    const diameterInMm = diameterInPixels / PIXELS_PER_MM_ESTIMATE;

    // A normal pupil size is between 2mm to 8mm.
    // Let's clamp it to a reasonable range to avoid noise.
    return Math.max(1.5, Math.min(9.0, diameterInMm));
  }

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

      // 1. Dilation Score (0-60 points)
      // We assume peak concentration happens with a slight pupil dilation (e.g., 10-20% larger).
      // We'll map the dilation ratio to a score. A ratio of 1.0 (same as baseline) gives a
      // medium score, while a ratio of ~1.15 gives a high score.
      const clampedDilation = Math.max(0.9, Math.min(1.2, dilationRatio)); // Clamp to a reasonable range
      const normalizedDilation = (clampedDilation - 0.9) / (1.2 - 0.9); // Normalize to 0-1
      const dilationScore = normalizedDilation * 60;

      // 2. Stability Score (0-40 points)
      // Less variability (more stable pupil size) indicates higher focus.
      // A variability of 0 is perfect stability, and 1 is max instability.
      const stabilityScore = (1 - Math.min(1, variability * this.settings.sensitivity)) * 40;

      // 3. Combine scores and clamp
      let concentrationScore = dilationScore + stabilityScore;
      concentrationScore = Math.max(0, Math.min(100, concentrationScore)); // Clamp to 0-100

      this.concentrationLevel = this.smoothValue(this.concentrationLevel, concentrationScore);
    } else {
      // Not calibrated yet, or bad calibration data.
      // The UI will show the initial value of 0.
    }
  }
  calculatePupilVariability(): number {
    if (this.pupilSizeHistory.length < 10) return 0;
    const recent = this.pupilSizeHistory.slice(-10);
    const mean = recent.reduce((a, b) => a + b) / recent.length;
    const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
    return Math.min(1, Math.sqrt(variance) / mean);
  }

  smoothValue(currentValue: number, newValue: number): number {
    const smoothingFactor = this.settings.smoothing / 10;
    return currentValue * smoothingFactor + newValue * (1 - smoothingFactor);
  }

  drawFaceBox(ctx: CanvasRenderingContext2D, face: any) {
    if (!face.box) return;
    const { xMin, yMin, width, height } = face.box;
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(xMin, yMin, width, height);
  }

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
  resetCurrentMetrics() {
    this.leftPupilSize = 0;
    this.rightPupilSize = 0;
    this.concentrationLevel=0;
    this.concentrationLevel = this.smoothValue(this.concentrationLevel, 0);
  }

  recalibrate() {
    if (!this.isTracking) return;
    console.log('Recalibrating...');
    this.isCalibrated = false;
    this.baselinePupilSize = 0;
    this.pupilSizeHistory = []; // Start collecting fresh data for a new baseline
    this.concentrationLevel = 0; // Reset concentration during recalibration
  }





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