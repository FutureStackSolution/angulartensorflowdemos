import { Routes } from '@angular/router';
import { PupilConcentrationTrackerComponent } from './pupil-concentration-tracker/pupil-concentration-tracker.component';
import { ObjectDetectionComponent } from './object-detection/object-detection';

export const routes: Routes = [
  { path: 'eye-tracker', component: PupilConcentrationTrackerComponent },
  { path: 'object-detection', component: ObjectDetectionComponent },
  { path: '', redirectTo: '/home', pathMatch: 'full' }
];
