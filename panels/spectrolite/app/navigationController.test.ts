import { expect, it } from "vitest";
import { NavigationController } from "./navigationController";
import { createStore } from "./store";
import { initialState } from "./state";

it("keeps vault navigation behind a pending file transition and propagates original failure while permitting recovery", async () => {
  const store = createStore(
    initialState({
      contextId: "ctx",
      channelName: "chat",
      repoRoot: "notes",
      openPath: "Original.mdx",
    }),
  );
  const navigation = new NavigationController(store);
  const failure = new Error("Permission denied");
  let reject!: (error: Error) => void;
  const save = new Promise<void>((_, fail) => {
    reject = fail;
  });
  const file = navigation.run(async () => {
    await save;
    store.setState({ activePath: "Next.mdx" });
  });
  const rejected = expect(file).rejects.toBe(failure);
  let switched = false;
  const vault = navigation.run(async () => {
    switched = true;
    store.setState({ repoRoot: null });
  });
  await Promise.resolve();
  expect(store.getState().navigationPending).toBe(true);
  expect(switched).toBe(false);
  reject(failure);
  await rejected;
  expect(store.getState().activePath).toBe("Original.mdx");
  await vault;
  expect(switched).toBe(true);
  expect(store.getState().navigationPending).toBe(false);
});
