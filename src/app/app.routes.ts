import { Routes } from '@angular/router';
import { PupilConcentrationTrackerComponent } from './pupil-concentration-tracker/pupil-concentration-tracker.component';
import { ObjectDection } from './object-dection/object-dection';

export const routes: Routes = [
  { path: 'eye-tracker', component: PupilConcentrationTrackerComponent },
  { path: 'object-detection', component: ObjectDection },
  { path: '', redirectTo: '/home', pathMatch: 'full' }
];
