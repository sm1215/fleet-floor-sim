export interface Floor {
  id: number;
  height: number;
  width: number;
}

export type FloorSize = Pick<Floor, 'width' | 'height'>;
