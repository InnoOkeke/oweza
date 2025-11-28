import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_PERMISSION_KEY = '@metasend:location_permission';
const USER_COUNTRY_KEY = '@metasend:user_country';

export type LocationPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface UserLocation {
  country: string;
  countryCode: string;
  region?: string;
  city?: string;
}

/**
 * Request location permission from the user
 */
export async function requestLocationPermission(): Promise<LocationPermissionStatus> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();

    await AsyncStorage.setItem(LOCATION_PERMISSION_KEY, status);

    if (status === 'granted') {
      return 'granted';
    } else if (status === 'denied') {
      return 'denied';
    }
    return 'undetermined';
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return 'denied';
  }
}

/**
 * Check current location permission status
 */
export async function checkLocationPermission(): Promise<LocationPermissionStatus> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();

    if (status === 'granted') {
      return 'granted';
    } else if (status === 'denied') {
      return 'denied';
    }
    return 'undetermined';
  } catch (error) {
    console.error('Error checking location permission:', error);
    return 'undetermined';
  }
}

/**
 * Get user's current location and country
 */
export async function getUserLocation(): Promise<UserLocation | null> {
  try {
    const permissionStatus = await checkLocationPermission();

    if (permissionStatus !== 'granted') {
      // Return cached location if available
      const cachedCountry = await AsyncStorage.getItem(USER_COUNTRY_KEY);
      if (cachedCountry) {
        return JSON.parse(cachedCountry);
      }
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });

    const [reverseGeocode] = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    if (reverseGeocode) {
      const userLocation: UserLocation = {
        country: reverseGeocode.country || '',
        countryCode: reverseGeocode.isoCountryCode?.toUpperCase() || '',
        region: reverseGeocode.region || undefined,
        city: reverseGeocode.city || undefined,
      };

      // Cache the location
      await AsyncStorage.setItem(USER_COUNTRY_KEY, JSON.stringify(userLocation));

      return userLocation;
    }

    return null;
  } catch (error) {
    console.error('Error getting user location:', error);

    // Try to return cached location
    const cachedCountry = await AsyncStorage.getItem(USER_COUNTRY_KEY);
    if (cachedCountry) {
      return JSON.parse(cachedCountry);
    }

    return null;
  }
}

/**
 * Get user's country code (with fallback to device locale)
 */
export async function getUserCountryCode(): Promise<string> {
  const location = await getUserLocation();
  return location?.countryCode || '';
}

/**
 * Get user's location from IP address (no permission required)
 */
export async function getUserLocationFromIP(): Promise<UserLocation | null> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();

    if (data.error) return null;

    return {
      country: data.country_name,
      countryCode: data.country_code,
      region: data.region,
      city: data.city
    };
  } catch (error) {
    console.error('Error getting IP location:', error);
    return null;
  }
}

/**
 * Clear cached location data
 */
export async function clearLocationCache(): Promise<void> {
  await AsyncStorage.removeItem(USER_COUNTRY_KEY);
  await AsyncStorage.removeItem(LOCATION_PERMISSION_KEY);
}
