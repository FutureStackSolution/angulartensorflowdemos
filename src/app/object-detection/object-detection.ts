import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

@Component({
  selector: 'app-object-detection',
  standalone: true,
  imports: [],
  templateUrl: './object-detection.html',
  styleUrls: ['./object-detection.css']
})
export class ObjectDetectionComponent implements OnInit {
  @ViewChild('video', { static: true }) video!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;

  private model!: cocoSsd.ObjectDetection;

  async ngOnInit() {
    await this.loadModel();
    this.startCamera();
  }

  async loadModel() {
    this.model = await cocoSsd.load();
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
    const video = this.video.nativeElement;
    const canvas = this.canvas.nativeElement;
    const context = canvas.getContext('2d');

    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const predictions = await this.model.detect(video);
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
