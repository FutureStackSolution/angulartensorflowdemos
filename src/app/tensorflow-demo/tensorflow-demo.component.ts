import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as tf from '@tensorflow/tfjs';

@Component({
  selector: 'app-tensorflow-demo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tensorflow-demo.component.html',
  styleUrls: ['./tensorflow-demo.component.css']
})
export class TensorflowDemoComponent implements OnInit {
  modelInfo: string = '';
  predictionResult: string = '';

  ngOnInit() {
    // Display TensorFlow.js version
    this.modelInfo = `TensorFlow.js version: ${tf.version.tfjs}`;
    
    // Run a simple TensorFlow.js operation
    this.runSimplePrediction();
  }

  async runSimplePrediction() {
    // Create a simple model
    const model = tf.sequential();
    model.add(tf.layers.dense({units: 1, inputShape: [1]}));
    
    // Prepare the model for training
    model.compile({loss: 'meanSquaredError', optimizer: 'sgd'});
    
    // Generate some synthetic data for training
    const xs = tf.tensor2d([1, 2, 3, 4], [4, 1]);
    const ys = tf.tensor2d([1, 3, 5, 7], [4, 1]);
    
    // Train the model
    await model.fit(xs, ys, {epochs: 100});
    
    // Use the model to make predictions
    const output = model.predict(tf.tensor2d([5], [1, 1])) as tf.Tensor;
    const prediction = await output.data();
    
    this.predictionResult = `Prediction for input 5: ${prediction[0].toFixed(2)}`;
  }
}