import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-object-detection',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './object-detection.html',
  styleUrls: ['./object-detection.css']
})
export class ObjectDetectionComponent implements OnInit {
  @ViewChild('video', { static: true }) video!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;

  private model!: cocoSsd.ObjectDetection;
  isTracking = false;
  // Lower this value to detect more objects, but with lower confidence
  private detectionThreshold = 0.4;

  async ngOnInit() {
    await this.loadModel();
  }

  async loadModel() {
    this.model = await cocoSsd.load({ base: 'mobilenet_v2' });
  }

  startTracking() {
    this.isTracking = true;
    this.startCamera();
  }

  stopTracking() {
    this.isTracking = false;
    const stream = this.video.nativeElement.srcObject as MediaStream;
    stream.getTracks().forEach(track => track.stop());
    this.video.nativeElement.srcObject = null;
    const context = this.canvas.nativeElement.getContext('2d');
    context?.clearRect(0, 0, this.canvas.nativeElement.width, this.canvas.nativeElement.height);
  }

  async startCamera() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        this.video.nativeElement.srcObject = stream;
        this.video.nativeElement.addEventListener('loadeddata', () => {
          this.detectObjects();
        });
      } catch (error) {
        console.error('Error accessing camera:', error);
      }
    }
  }

  async detectObjects() {
    if (!this.isTracking) {
      return;
    }

    const video = this.video.nativeElement;
    const canvas = this.canvas.nativeElement;
    const context = canvas.getContext('2d');

    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const predictions = await this.model.detect(video, undefined, this.detectionThreshold);
      this.drawBoundingBoxes(predictions, context);

      requestAnimationFrame(() => {
        this.detectObjects();
      });
    }
  }

  drawBoundingBoxes(predictions: cocoSsd.DetectedObject[], context: CanvasRenderingContext2D) {
    predictions.forEach(prediction => {
      const [x, y, width, height] = prediction.bbox;
      const text = `${prediction.class}: ${Math.round(prediction.score * 100)}%`;

      context.strokeStyle = '#00FFFF';
      context.lineWidth = 2;
      context.strokeRect(x, y, width, height);

      context.fillStyle = '#00FFFF';
      const textWidth = context.measureText(text).width;
      context.fillRect(x, y, textWidth + 4, 20);

      context.fillStyle = '#000000';
      context.fillText(text, x + 2, y + 14);
    });
  }
}
