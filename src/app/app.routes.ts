import { Routes } from '@angular/router';
import { PupilConcentrationTrackerComponent } from './pupil-concentration-tracker/pupil-concentration-tracker.component';
import { ObjectDetectionComponent } from './object-detection/object-detection';
import { HandDetectionComponent } from './hand-detection/hand-detection.component';

export const routes: Routes = [
  { path: 'eye-tracker', component: PupilConcentrationTrackerComponent },
  { path: 'object-detection', component: ObjectDetectionComponent },
  { path: 'hand-detection', component: HandDetectionComponent },
  { path: '', redirectTo: '/eye-tracker', pathMatch: 'full' }
];
