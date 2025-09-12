import { Component, ElementRef, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { DetectionConfig, DetectionStats } from '../models';

@Component({
  selector: 'app-object-detection',
  standalone: true,
  imports: [MatButtonModule, MatProgressSpinnerModule, MatSnackBarModule, MatIconModule, MatCardModule],
  templateUrl: './object-detection.html',
  styleUrls: ['./object-detection.css']
})
export class ObjectDetectionComponent implements OnInit, OnDestroy {
  @ViewChild('video', { static: true }) video!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;

  private model!: cocoSsd.ObjectDetection;
  private animationFrameId: number | null = null;
  private lastDetectionTime = 0;
  private mediaStream: MediaStream | null = null;
  private currentDetectionCount = 0;
  private detectionFrames = 0;
  private lastFpsTime = 0;
  private currentFps = 0;
  
  isTracking = false;
  isLoading = false;
  isModelLoaded = false;
  errorMessage = '';
  
  // Optimized configuration
  private config: DetectionConfig = {
    threshold: 0.4,
    maxDetections: 10,
    frameRate: 30, // Target FPS
    modelType: 'lite_mobilenet_v2' // Lighter model for better performance
  };

  constructor(
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit() {
    // Model will be loaded when user clicks "Start Tracking"
  }

  ngOnDestroy() {
    this.cleanup();
  }

  async loadModel() {
    try {
      this.isLoading = true;
      this.errorMessage = '';
      this.cdr.detectChanges();

      // Use the lighter model for better performance
      this.model = await cocoSsd.load({ 
        base: this.config.modelType 
      });
      
      this.isModelLoaded = true;
    } catch (error) {
      this.errorMessage = 'Failed to load model. Please refresh the page.';
      this.showMessage(this.errorMessage, 'error');
      console.error('Model loading error:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async startTracking() {
    if (!this.isModelLoaded) {
      await this.loadModel();
    }
    
    if (this.isModelLoaded) {
      this.isTracking = true;
      this.startCamera();
    }
  }

  stopTracking() {
    this.isTracking = false;
    this.cleanup();
  }

  private cleanup() {
    // Cancel animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop camera stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Clear video and canvas
    if (this.video?.nativeElement) {
      this.video.nativeElement.srcObject = null;
    }

    if (this.canvas?.nativeElement) {
      const context = this.canvas.nativeElement.getContext('2d');
      if (context) {
        context.clearRect(0, 0, this.canvas.nativeElement.width, this.canvas.nativeElement.height);
      }
    }
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.showMessage('Camera not supported on this device', 'error');
      return;
    }

    try {
      // Optimized camera constraints for better performance
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: this.config.frameRate, max: 30 }
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.nativeElement.srcObject = this.mediaStream;
      
      this.video.nativeElement.addEventListener('loadeddata', () => {
        this.detectObjects();
      }, { once: true });

    } catch (error) {
      console.error('Error accessing camera:', error);
      this.showMessage('Failed to access camera. Please check permissions.', 'error');
      this.isTracking = false;
    }
  }

  async detectObjects() {
    if (!this.isTracking || !this.model) {
      return;
    }

    const now = performance.now();
    const timeSinceLastDetection = now - this.lastDetectionTime;
    const targetInterval = 1000 / this.config.frameRate;

    // Frame rate limiting for better performance
    if (timeSinceLastDetection < targetInterval) {
      this.animationFrameId = requestAnimationFrame(() => this.detectObjects());
      return;
    }

    this.lastDetectionTime = now;

    const video = this.video.nativeElement;
    const canvas = this.canvas.nativeElement;
    const context = canvas.getContext('2d');

    if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) {
      this.animationFrameId = requestAnimationFrame(() => this.detectObjects());
      return;
    }

    try {
      // Clear canvas efficiently
      context.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw video frame
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Run detection with optimized parameters
      const predictions = await this.model.detect(video, this.config.maxDetections, this.config.threshold);
      
      // Update statistics
      this.currentDetectionCount = predictions.length;
      this.updateFps();
      
      // Draw bounding boxes
      this.drawBoundingBoxes(predictions, context);

    } catch (error) {
      console.error('Detection error:', error);
      this.showMessage('Detection error occurred', 'error');
    }

    // Continue detection loop
    this.animationFrameId = requestAnimationFrame(() => this.detectObjects());
  }

  private drawBoundingBoxes(predictions: cocoSsd.DetectedObject[], context: CanvasRenderingContext2D) {
    // Batch drawing operations for better performance
    context.save();
    
    predictions.forEach(prediction => {
      const [x, y, width, height] = prediction.bbox;
      const score = Math.round(prediction.score * 100);
      const text = `${prediction.class}: ${score}%`;

      // Skip very low confidence detections
      if (score < 30) return;

      // Set drawing styles
      context.strokeStyle = this.getColorForClass(prediction.class);
      context.fillStyle = this.getColorForClass(prediction.class);
      context.lineWidth = 2;
      context.font = '14px Arial';

      // Draw bounding box
      context.strokeRect(x, y, width, height);

      // Draw label background
      const textWidth = context.measureText(text).width;
      const labelHeight = 20;
      context.fillRect(x, y - labelHeight, textWidth + 8, labelHeight);

      // Draw label text
      context.fillStyle = '#FFFFFF';
      context.fillText(text, x + 4, y - 6);
    });
    
    context.restore();
  }

  private getColorForClass(className: string): string {
    // Generate consistent colors for different object classes
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    
    let hash = 0;
    for (let i = 0; i < className.length; i++) {
      hash = className.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  private showMessage(message: string, type: 'success' | 'error' | 'info' = 'info') {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: [`snackbar-${type}`]
    });
  }

  // Public methods for configuration (can be called from template)
  updateThreshold(threshold: number) {
    this.config.threshold = Math.max(0.1, Math.min(1.0, threshold));
  }

  updateMaxDetections(maxDetections: number) {
    this.config.maxDetections = Math.max(1, Math.min(20, maxDetections));
  }

  getConfig() {
    return { ...this.config };
  }

  // Statistics methods
  getCurrentDetectionCount(): number {
    return this.currentDetectionCount;
  }

  getDetectionRate(): number {
    return Math.round(this.currentFps);
  }

  private updateFps() {
    this.detectionFrames++;
    const now = performance.now();
    
    if (now - this.lastFpsTime >= 1000) {
      this.currentFps = this.detectionFrames;
      this.detectionFrames = 0;
      this.lastFpsTime = now;
    }
  }

  updateFrameRate(frameRate: number) {
    this.config.frameRate = Math.max(15, Math.min(60, frameRate));
  }
}
