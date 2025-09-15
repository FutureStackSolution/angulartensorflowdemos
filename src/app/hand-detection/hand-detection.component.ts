import { Component, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-hand-detection',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule],
  templateUrl: './hand-detection.component.html',
  styleUrls: ['./hand-detection.component.css']
})
export class HandDetectionComponent {
  @ViewChild('video') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvasElement!: ElementRef<HTMLCanvasElement>;

  isTracking = false;
  isLoading = false;
  errorMessage = '';

  constructor(private cdr: ChangeDetectorRef, private snackBar: MatSnackBar) {}

  /** Starts the camera and begins drawing frames to the canvas. */
  async startTracking() {
    try {
      this.isLoading = true;
      this.cdr.detectChanges();

      const constraints: MediaStreamConstraints = {
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = this.videoElement.nativeElement;
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
        this.isTracking = true;
        this.isLoading = false;
        this.cdr.detectChanges();
        this.drawLoop();
        this.showMessage('Camera started. Hand detection coming soon.', 'info');
      };
    } catch (err) {
      this.isLoading = false;
      this.isTracking = false;
      this.errorMessage = 'Unable to access camera. Please check permissions.';
      this.showMessage(this.errorMessage, 'error');
      this.cdr.detectChanges();
    }
  }

  /** Stops camera stream and clears canvas. */
  stopTracking() {
    this.isTracking = false;
    const video = this.videoElement?.nativeElement;
    const mediaStream = (video?.srcObject as MediaStream) || null;
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      if (video) video.srcObject = null;
    }
    const canvas = this.canvasElement?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.showMessage('Tracking stopped', 'info');
  }

  private drawLoop() {
    if (!this.isTracking) return;
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const ctx = canvas.getContext('2d');
    if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Placeholder: Hand landmarks / boxes would be drawn here.
    }
    requestAnimationFrame(() => this.drawLoop());
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

