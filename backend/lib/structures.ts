/**
 * Double-ended queue (deque) implementation
 * Allows efficient insertion and removal from both ends
 */
export class Deque<T> {
  private items: T[] = [];

  constructor(initialItems?: T[]){
    if(initialItems) this.items = initialItems;
  }

  /**
   * Add an element to the front of the deque
   */
  pushFront(item: T): void {
    this.items.unshift(item);
  }

  /**
   * Add an element to the back of the deque
   */
  pushBack(item: T): void {
    this.items.push(item);
  }

  /**
   * Remove and return the element from the front of the deque
   * @returns The front element, or undefined if deque is empty
   */
  popFront(): T | undefined {
    return this.items.shift();
  }

  /**
   * Remove and return the element from the back of the deque
   * @returns The back element, or undefined if deque is empty
   */
  popBack(): T | undefined {
    return this.items.pop();
  }

  /**
   * View the front element without removing it
   * @returns The front element, or undefined if deque is empty
   */
  peekFront(): T | undefined {
    return this.items[0];
  }

  /**
   * View the back element without removing it
   * @returns The back element, or undefined if deque is empty
   */
  peekBack(): T | undefined {
    return this.items[this.items.length - 1];
  }

  /**
   * Get the number of elements in the deque
   */
  get size(): number {
    return this.items.length;
  }

  /**
   * Check if the deque is empty
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Remove all elements from the deque
   */
  clear(): void {
    this.items = [];
  }

  /**
   * Convert the deque to an array
   * @returns Array representation of the deque (front to back)
   */
  toArray(): T[] {
    return [...this.items];
  }

  /**
   * Iterate over the deque from front to back
   */
  *[Symbol.iterator](): Iterator<T> {
    for (const item of this.items) {
      yield item;
    }
  }
}
