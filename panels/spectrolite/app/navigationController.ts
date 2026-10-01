import type { Store } from "./store";
import type { SpectroliteState } from "./state";

/** One queue owns file and vault transitions; failures leave the current editor mounted. */
export class NavigationController {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly store: Store<SpectroliteState>) {}

  run(operation: () => Promise<void>): Promise<void> {
    const result = this.tail.then(async () => {
      this.store.setState({ navigationPending: true, navigationError: null });
      try {
        await operation();
      } catch (error) {
        this.store.setState({
          navigationError:
            error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        this.store.setState({ navigationPending: false });
      }
    });
    // The owner records failure; each caller still receives the original rejection.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
