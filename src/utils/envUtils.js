/**
 * envUtils.js
 * Utilities for generating mock environmental data for maritime intelligence.
 */

const WEATHER_CONDITIONS = ['Clear', 'Partly Cloudy', 'Overcast', 'Light Rain', 'Stormy', 'Foggy'];
const SEA_STATES = ['Calm', 'Moderate', 'Rough'];

/**
 * Deterministic pseudorandom generator based on a string seed (e.g., vessel ID)
 */
function seedRandom(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

/**
 * Generates environment data for a specific ship based on its ID.
 * This ensures the data remains the same for the ship across renders.
 */
export function getShipEnvironment(shipId) {
  const rnd = seedRandom(shipId);
  
  // Weather
  const conditionIndex = Math.floor(rnd * WEATHER_CONDITIONS.length);
  const condition = WEATHER_CONDITIONS[conditionIndex];
  
  // Temperature: 15°C to 32°C
  const temp = Math.floor(15 + rnd * 17);
  
  // Wind Speed: 5 to 45 knots
  const windSpeed = Math.floor(5 + ((rnd * 0.7 + 0.3) % 1) * 40);
  
  // Sea State based on wind or independent
  let seaState;
  if (windSpeed > 35) seaState = 'Rough';
  else if (windSpeed > 18) seaState = 'Moderate';
  else seaState = 'Calm';

  return {
    condition,
    temp,
    windSpeed,
    seaState,
    icon: getConditionIcon(condition)
  };
}

function getConditionIcon(condition) {
  switch (condition) {
    case 'Clear': return '☀️';
    case 'Partly Cloudy': return '⛅';
    case 'Overcast': return '☁️';
    case 'Light Rain': return '🌧️';
    case 'Stormy': return '⛈️';
    case 'Foggy': return '🌫️';
    default: return '❓';
  }
}

/**
 * Determines if it's currently day or night based on hours.
 */
export function getSystemTimeMode() {
  const hour = new Date().getHours();
  return (hour >= 6 && hour < 18) ? 'day' : 'night';
}
