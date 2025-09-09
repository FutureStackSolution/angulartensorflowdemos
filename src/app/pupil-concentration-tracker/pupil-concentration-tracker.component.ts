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
  concentrationLevel: number = 75; // Example value
  leftPupilSize: number = 4.2; // Example value in mm
  rightPupilSize: number = 4.5; // Example value in mm
  isTracking: boolean = false;
  
  startTracking(): void {
    this.isTracking = true;
    // Simulate tracking with TensorFlow.js
    const updateInterval = setInterval(() => {
      if (!this.isTracking) {
        clearInterval(updateInterval);
        return;
      }
      
      // Simulate pupil size changes (would be replaced with actual TensorFlow.js detection)
      this.leftPupilSize = Math.round((3.5 + Math.random() * 1.5) * 10) / 10;
      this.rightPupilSize = Math.round((3.5 + Math.random() * 1.5) * 10) / 10;
      
      // Calculate concentration based on pupil sizes (simplified example)
      const avgPupilSize = (this.leftPupilSize + this.rightPupilSize) / 2;
      this.concentrationLevel = Math.round(Math.min(100, Math.max(0, 100 - (avgPupilSize - 4) * 50)));
    }, 1000);
  }
  
  stopTracking(): void {
    this.isTracking = false;
    // Reset values when tracking is stopped
    this.concentrationLevel = 75;
    this.leftPupilSize = 4.2;
    this.rightPupilSize = 4.5;
  }
}