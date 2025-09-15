import { Component, ElementRef, ViewChild, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
import * as tf from '@tensorflow/tfjs';

@Component({
  selector: 'app-hand-detection',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule],
  templateUrl: './hand-detection.component.html',
  styleUrls: ['./hand-detection.component.css']
})
export class HandDetectionComponent implements OnDestroy {
  @ViewChild('video', { static: false }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  isTracking = false;
  isLoading = false;
  isModelLoaded = false;
  errorMessage = '';

  private detector: handPoseDetection.HandDetector | null = null;
  private mediaStream: MediaStream | null = null;
  private animationId: number | null = null;
  private lastDetectTime = 0;
  private targetFps = 20;
  private consecutiveZeroDetections = 0;
  private runtime: 'tfjs' | 'mediapipe' = 'tfjs';
  private currentHandsCount = 0;
  private detectorCanvas: HTMLCanvasElement | null = null;
  private detectorCtx: CanvasRenderingContext2D | null = null;
  private scaleX = 1;
  private scaleY = 1;

  constructor(private cdr: ChangeDetectorRef, private snackBar: MatSnackBar) {}

  async loadModel() {
    if (this.detector) return;
    try {
      this.isLoading = true;
      this.errorMessage = '';
      this.cdr.detectChanges();

      // Ensure TFJS backend is ready (use WebGL for performance)
      try {
        await tf.setBackend('webgl');
      } catch {}
      await tf.ready();

      const model = handPoseDetection.SupportedModels.MediaPipeHands;
      try {
        const config: handPoseDetection.MediaPipeHandsTfjsModelConfig = {
          runtime: 'tfjs',
          modelType: 'lite'
        };
        this.detector = await handPoseDetection.createDetector(model, config);
        this.runtime = 'tfjs';
        this.isModelLoaded = true;
      } catch (e) {
        console.warn('TFJS runtime failed, falling back to MediaPipe runtime...', e);
        const mpConfig: handPoseDetection.MediaPipeHandsMediaPipeModelConfig = {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands'
        };
        this.detector = await handPoseDetection.createDetector(model, mpConfig);
        this.runtime = 'mediapipe';
        this.isModelLoaded = true;
      }
    } catch (err) {
      this.errorMessage = 'Failed to load hand model. Please refresh the page.';
      this.showMessage(this.errorMessage, 'error');
      console.error(err);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async startTracking() {
    if (!this.isModelLoaded) {
      await this.loadModel();
    }
    if (!this.detector) return;

    try {
      this.isLoading = true;
      this.cdr.detectChanges();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported on this device/browser');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: this.targetFps, max: 30 },
          facingMode: 'user'
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      const video = this.videoRef.nativeElement;
      video.srcObject = this.mediaStream;
      video.addEventListener('loadeddata', () => {
        video.play();
        this.isTracking = true;
        this.isLoading = false;
        // Initialize display canvas size and low-res detector canvas once
        const displayCanvas = this.canvasRef.nativeElement;
        displayCanvas.width = video.videoWidth || 640;
        displayCanvas.height = video.videoHeight || 480;

        // Setup low-resolution detector canvas to speed up model
        const targetDetectorWidth = 320;
        const aspect = displayCanvas.height / displayCanvas.width || (480 / 640);
        const targetDetectorHeight = Math.round(targetDetectorWidth * aspect);
        this.detectorCanvas = document.createElement('canvas');
        this.detectorCanvas.width = targetDetectorWidth;
        this.detectorCanvas.height = targetDetectorHeight;
        this.detectorCtx = this.detectorCanvas.getContext('2d');
        this.scaleX = displayCanvas.width / targetDetectorWidth;
        this.scaleY = displayCanvas.height / targetDetectorHeight;
        this.cdr.detectChanges();
        this.loop();
        this.showMessage(`Hand detection started (${this.runtime})`, 'success');
      }, { once: true });
    } catch (err) {
      console.error('Camera error:', err);
      this.errorMessage = 'Unable to access camera. Please check permissions.';
      this.showMessage(this.errorMessage, 'error');
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  stopTracking() {
    this.isTracking = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.videoRef?.nativeElement) {
      this.videoRef.nativeElement.srcObject = null;
    }
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.showMessage('Hand detection stopped', 'info');
  }

  ngOnDestroy() {
    this.stopTracking();
  }

  private async loop() {
    if (!this.isTracking) return;
    const now = performance.now();
    const minInterval = 1000 / this.targetFps;
    if (now - this.lastDetectTime < minInterval) {
      this.animationId = requestAnimationFrame(() => this.loop());
      return;
    }
    this.lastDetectTime = now;

    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      this.animationId = requestAnimationFrame(() => this.loop());
      return;
    }

    // Avoid resizing canvas every frame unless it changed
    const desiredW = video.videoWidth || 640;
    const desiredH = video.videoHeight || 480;
    if (canvas.width !== desiredW || canvas.height !== desiredH) {
      canvas.width = desiredW;
      canvas.height = desiredH;
      if (this.detectorCanvas) {
        this.scaleX = canvas.width / this.detectorCanvas.width;
        this.scaleY = canvas.height / this.detectorCanvas.height;
      }
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      let hands: handPoseDetection.Hand[] = [];
      if (this.detectorCtx && this.detectorCanvas) {
        this.detectorCtx.drawImage(video, 0, 0, this.detectorCanvas.width, this.detectorCanvas.height);
        hands = await this.detector!.estimateHands(this.detectorCanvas, { flipHorizontal: true });
      } else {
        hands = await this.detector!.estimateHands(video, { flipHorizontal: true });
      }
      this.currentHandsCount = hands?.length || 0;
      if (!hands || hands.length === 0) {
        this.consecutiveZeroDetections++;
      } else {
        this.consecutiveZeroDetections = 0;
      }
      this.drawHands(ctx, hands);

      // If tfjs runtime yields no detections for a while, auto-switch to mediapipe
      if (this.runtime === 'tfjs' && this.consecutiveZeroDetections > 60) {
        console.warn('No hands detected for a while on TFJS. Switching to MediaPipe runtime.');
        this.detector?.dispose?.();
        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        const mpConfig: handPoseDetection.MediaPipeHandsMediaPipeModelConfig = {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands'
        };
        this.detector = await handPoseDetection.createDetector(model, mpConfig);
        this.runtime = 'mediapipe';
        this.consecutiveZeroDetections = 0;
        this.showMessage('Switched to MediaPipe runtime for better detection.', 'info');
      }
    } catch (err) {
      console.error('Detection error:', err);
    }

    this.animationId = requestAnimationFrame(() => this.loop());
  }

  private drawHands(ctx: CanvasRenderingContext2D, hands: handPoseDetection.Hand[]) {
    ctx.save();
    ctx.lineWidth = 2;
    hands.forEach(hand => {
      // Map keypoints into display space if using low-res detector canvas
      const mapped = hand.keypoints.map((kp: any) => ({ name: kp.name, x: kp.x * this.scaleX, y: kp.y * this.scaleY }));
      ctx.fillStyle = '#4ECDC4';
      ctx.beginPath();
      for (let i = 0; i < mapped.length; i++) {
        const p = mapped[i];
        ctx.moveTo(p.x + 2, p.y);
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      }
      ctx.fill();

      // Draw connections between keypoints (simple finger lines)
      ctx.strokeStyle = '#FF6B6B';
      const fingers = [
        ['wrist', 'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip'],
        ['wrist', 'index_finger_mcp', 'index_finger_pip', 'index_finger_dip', 'index_finger_tip'],
        ['wrist', 'middle_finger_mcp', 'middle_finger_pip', 'middle_finger_dip', 'middle_finger_tip'],
        ['wrist', 'ring_finger_mcp', 'ring_finger_pip', 'ring_finger_dip', 'ring_finger_tip'],
        ['wrist', 'pinky_finger_mcp', 'pinky_finger_pip', 'pinky_finger_dip', 'pinky_finger_tip']
      ];
      const byName: Record<string, any> = {};
      for (let i = 0; i < mapped.length; i++) byName[mapped[i].name] = mapped[i];
      for (let f = 0; f < fingers.length; f++) {
        const path = fingers[f];
        ctx.beginPath();
        for (let i = 0; i < path.length; i++) {
          const p = byName[path[i]];
          if (!p) continue;
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    });
    // Overlay debug text
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '12px Arial';
    ctx.fillText(`Hands: ${hands.length} | Runtime: ${this.runtime}`, 8, 18);
    ctx.restore();
  }

  // Template helpers
  getHandsCount() {
    return this.currentHandsCount;
  }
  getRuntime() {
    return this.runtime;
  }

  private showMessage(message: string, type: 'success' | 'error' | 'info' = 'info') {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: [`snackbar-${type}`]
    });
  }
}

