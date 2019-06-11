import { Timer } from "./timer";

jest.useFakeTimers();

describe("Timer", () => {
  it("should return on a regular interval", async () => {
    const timer = new Timer(10);
    timer.start();
    const promise = timer.nextTimeout();
    jest.advanceTimersByTime(10);
    const finished = await promise;
    expect(finished).toBeFalsy();
  });
  it("should return the same promise in the same interval", async () => {
    const timer = new Timer(10);
    timer.start();
    const promise1 = timer.nextTimeout();
    const promise2 = timer.nextTimeout();

    expect(promise1).toBe(promise2);
  });
  it("should return a new promise after the first timeout", async () => {
    const timer = new Timer(10);
    timer.start();
    const promise1 = timer.nextTimeout();
    jest.advanceTimersByTime(10);
    const promise2 = timer.nextTimeout();

    expect(promise1).not.toBe(promise2);
  });

  it("should resolve the pending promise immediately on completion", async () => {
    const timer = new Timer(10);
    timer.start();
    const promise1 = timer.nextTimeout();
    timer.complete();
    const finished = await promise1;
    expect(finished).toBeTruthy();
    expect(timer.complete).toBeTruthy();
  });

  it("should be safe to start the timer multiple times", async () => {
    const timer = new Timer(10);
    timer.start();
    const promise1 = timer.nextTimeout();
    jest.advanceTimersByTime(5);
    timer.start();
    jest.advanceTimersByTime(5);

    const finished = await promise1;
    expect(finished).toBeFalsy();
  });

  it("should return an immediately completing promise after completion", async () => {
    const timer = new Timer(10);
    timer.start();
    timer.complete();
    const finished = await timer.nextTimeout();
    expect(finished).toBeTruthy();
  });
});
