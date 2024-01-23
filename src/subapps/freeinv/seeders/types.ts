export interface FakeUser {
  password: string;
  email: string;
}

export interface UserLocationData {
  name: string;
  description: string;
  locationId: number;
  userId: string;
}

export interface Room {
  name: string;
  description: string;
  locationId: number;
  userId: string;
}

export interface Item {
  name: string;
  description: string;
  roomId: number;
  userId: string;
}
