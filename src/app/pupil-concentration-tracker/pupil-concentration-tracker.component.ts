import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';

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
export class PupilConcentrationTrackerComponent {
  concentrationLevel: number = 0; // Example value
  isTracking: boolean = false;
  
  startTracking(): void {
    this.isTracking = true;
    // Here would be the actual tracking logic using TensorFlow.js
  }
  
  stopTracking(): void {
    this.isTracking = false;
  }
}