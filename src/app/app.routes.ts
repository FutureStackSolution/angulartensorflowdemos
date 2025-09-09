import { Routes } from '@angular/router';
import { PupilConcentrationTrackerComponent } from './pupil-concentration-tracker/pupil-concentration-tracker.component';

export const routes: Routes = [
  { path: 'eye-tracker', component: PupilConcentrationTrackerComponent },
  { path: '', redirectTo: '/home', pathMatch: 'full' }
];
