export class Registry<K, V> {
  private map = new Map<K, V>();

  register (key: K, value: V): void {
    this.map.set(key, value);
  }

  get (key: K): V | undefined {
    return this.map.get(key);
  }

  has (key: K): boolean {
    return this.map.has(key);
  }

  getAll (): ReadonlyMap<K, V> {
    return this.map;
  }
}
