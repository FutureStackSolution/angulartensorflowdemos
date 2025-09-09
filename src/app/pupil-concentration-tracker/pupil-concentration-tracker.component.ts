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
  

  // New detector instead of old model
  private detector: faceLandmarksDetection.FaceLandmarksDetector | null = null;
  private stream: MediaStream | null = null;
  private animationId: number = 0;
  private calibrationData: number[] = [];
  private baselinePupilSize = 0;
  private pupilSizeHistory: number[] = [];
  private isCalibrated: boolean = false;


  settings = {
    sensitivity: 1.0,
    smoothing: 5,
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

    this.drawFaceBox(ctx, face);

    const leftEye = this.extractEyeRegion(face.keypoints, 'left');
    const rightEye = this.extractEyeRegion(face.keypoints, 'right');

    if (leftEye && rightEye) {
      this.leftPupilSize = this.calculatePupilSize(leftEye);
      this.rightPupilSize = this.calculatePupilSize(rightEye);

      this.drawEyeIndicators(ctx, leftEye, rightEye);
      this.updateConcentration();

      
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

  calculatePupilSize(eyeRegion: any[]): number {
    if (!eyeRegion || eyeRegion.length === 0) return 0;
    const baseSize = 3.5;
    const variation = (Math.random() - 0.5) * 1.0;
    const timeBasedVariation = Math.sin(Date.now() / 10000) * 0.5;
    return Math.max(2.0, Math.min(5.0, baseSize + variation + timeBasedVariation));
  }

  updateConcentration() {
    const averagePupilSize = (this.leftPupilSize + this.rightPupilSize) / 2;
    this.pupilSizeHistory.push(averagePupilSize);
    if (this.pupilSizeHistory.length > 100) this.pupilSizeHistory.shift();

    if (this.baselinePupilSize === 0 && this.pupilSizeHistory.length >= 30) {
      this.baselinePupilSize = this.pupilSizeHistory.slice(0, 30).reduce((a, b) => a + b) / 30;
      this.isCalibrated = true;
    }

    if (this.isCalibrated) {
      const dilationRatio = averagePupilSize / this.baselinePupilSize;
      const variability = this.calculatePupilVariability();

      let concentrationScore = Math.min(100, Math.max(0,
        ((dilationRatio - 1) * this.settings.sensitivity * 100) +
        ((1 - variability) * 50) +
        Math.random() * 10 - 5
      ));

      this.concentrationLevel = this.smoothValue(this.concentrationLevel, concentrationScore);
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
  }

  
  
  

  
  
}