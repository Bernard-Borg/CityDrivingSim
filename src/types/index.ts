// Type definitions for the city driving simulator

// GeoJSON FeatureCollection types for  data
// Road-specific types (legacy, for backward compatibility)
export interface FeatureProperties {
    '@id': string;
    highway?: string;
    lanes?: string;
    lit?: string;
    maxspeed?: string;
    name?: string;
    surface?: string;
    bicycle?: string;
    foot?: string;
    mofa?: string;
    moped?: string;
    smoothness?: string;
    service?: string;
    zone?: string;
    tunnel?: string;
    bridge?: string;
    layer?: string;
    [key: string]: string | undefined;
}

export interface LineStringGeometry {
    type: 'LineString';
    coordinates: Array<[number, number]>; // [longitude, latitude]
}

export interface Feature {
    type: 'Feature';
    id?: string | number;
    properties: FeatureProperties;
    geometry: LineStringGeometry;
}

// OSM format types (native OpenStreetMap structure)
export interface OSMNode {
    type: 'node';
    id: number;
    lat: number;
    lon: number;
}

export interface OSMWay {
    type: 'way';
    id: number;
    nodes: number[];  // Array of node IDs
    tags?: {
        highway?: string;
        [key: string]: string | undefined;
    };
}

export type OSMElement = OSMNode | OSMWay;

export interface OSMData {
    elements: OSMElement[];
}

// Legacy format for backwards compatibility
export interface RoadPoint {
    x: number;
    z: number;
}

export interface Road {
    type: 'motorway' | 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'residential' | 'service';
    points: RoadPoint[];
}

export interface CityData {
    center?: {
        lat: number;
        lon: number;
    };
    roads: Road[];
}

// Use OSM format as the primary format
export type MapData = OSMData;

// Input state types
export interface InputState {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    brake: boolean;
    boost: boolean;
    handbrake: boolean;
}

export interface MouseState {
    x: number;
    y: number;
    isDown: boolean;
}

export type SpeedUpdateCallback = (speed: number) => void;
export type LoadCompleteCallback = () => void;

// Generic GeoJSON types (can be used for other cities too)
export interface GeoJSONPoint {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
}

export interface GeoJSONLineString {
    type: 'LineString';
    coordinates: Array<[number, number]>; // Array of [longitude, latitude]
}

export interface GeoJSONPolygon {
    type: 'Polygon';
    coordinates: Array<Array<[number, number]>>;
}

export type GeoJSONGeometry = GeoJSONPoint | GeoJSONLineString | GeoJSONPolygon;

export interface GeoJSONFeature {
    type: 'Feature';
    id?: string | number;
    properties: {
        highway?: string;
        [key: string]: string | number | boolean | undefined;
    };
    geometry: GeoJSONGeometry;
}

export interface GeoJSONFeatureCollection {
    type: 'FeatureCollection';
    generator?: string;
    copyright?: string;
    timestamp?: string;
    features: GeoJSONFeature[];
}

// Main GeoJSON type - supports roads (LineString), trees (Point), and buildings (Polygon)
// This is a type alias for GeoJSONFeatureCollection to allow all geometry types
export type GeoJSON = GeoJSONFeatureCollection;
