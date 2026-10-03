export interface JoinedAccount {
  name: string;
  cash: number;
}

export interface PitClient {
  join(name: string): Promise<JoinedAccount>;
}

export const mockPitClient: PitClient = {
  async join(name) {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 32) {
      throw new Error('name must be 1 to 32 characters');
    }
    return { name: cleanName, cash: 10_000 };
  },
};
