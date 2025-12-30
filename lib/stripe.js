import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is missing. Please set it in your .env file.');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // This line is REQUIRED to use automatic_payment_methods
  apiVersion: '2023-10-16', 
  appInfo: {
    name: 'Spawnly Server Panel',
    version: '1.0.0',
  },
});