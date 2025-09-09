import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavigationComponent } from './navigation/navigation.component';
import { PupilConcentrationTrackerComponent } from './pupil-concentration-tracker/pupil-concentration-tracker.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavigationComponent, PupilConcentrationTrackerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('Angular Tensorflow demos');
 

  
}
