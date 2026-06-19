export type Landmark = {
  x: number;
  y: number;
  z: number;
};

export type FaceLandmarkerResult = {
  status: 'success' | 'error';
  face_detected: boolean;
  landmarks: Landmark[];
  num_landmarks: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  image_dimensions?: {
    width: number;
    height: number;
  };
  message?: string;
};
