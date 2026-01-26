'use strict';

/**
 * CircuitBreaker — Custom implementation of the Circuit Breaker pattern.
 *
 * States:
 *   CLOSED    → Normal operation. Failures are tracked.
 *   OPEN      → Failing fast. No calls to downstream service.
 *   HALF_OPEN → Probing recovery. Limited trial calls allowed.
 *
 * Thresholds:
 *   - Request timeout: 2 seconds
 *   - Failure window: 10 requests
 *   - Failure rate threshold: 50% of window → OPEN
 *   - Consecutive timeout threshold: 5 → OPEN
 *   - OPEN duration: 30 seconds → HALF_OPEN
 *   - HALF_OPEN success trials needed: 3 → CLOSED
 */

const STATE = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
};

class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;

        // Configuration (with defaults matching requirements)
        this.requestTimeout = options.requestTimeout ?? 2000;       // ms
        this.windowSize = options.windowSize ?? 10;                  // requests
        this.failureRateThreshold = options.failureRateThreshold ?? 0.5; // 50%
        this.consecutiveFailureThreshold = options.consecutiveFailureThreshold ?? 5;
        this.openStateDuration = options.openStateDuration ?? 30000; // ms (30s)
        this.halfOpenMaxTrials = options.halfOpenMaxTrials ?? 3;

        // Internal state
        this._state = STATE.CLOSED;
        this._window = [];            // Sliding window: array of booleans (true=success, false=failure)
        this._consecutiveFailures = 0;
        this._openedAt = null;        // Timestamp when breaker last opened

        // HALF_OPEN tracking
        this._halfOpenTrials = 0;
        this._halfOpenSuccesses = 0;

        // Aggregate stats (never reset on state change)
        this._totalSuccess = 0;
        this._totalFailure = 0;
    }

    get state() {
        this._maybeTransitionFromOpen();
        return this._state;
    }

    /**
     * Execute a function through the circuit breaker.
     * @param {Function} fn - Async function that makes the downstream call.
     * @returns {Promise<any>} Result of fn, or throws CircuitOpenError.
     */
    async execute(fn) {
        this._maybeTransitionFromOpen();

        if (this._state === STATE.OPEN) {
            throw new CircuitOpenError(this.name, this._state);
        }

        if (this._state === STATE.HALF_OPEN) {
            if (this._halfOpenTrials >= this.halfOpenMaxTrials) {
                // All trials allocated — wait until a transition happens
                throw new CircuitOpenError(this.name, this._state);
            }
            this._halfOpenTrials++;
        }

        try {
            const result = await this._withTimeout(fn, this.requestTimeout);
            this._onSuccess();
            return result;
        } catch (err) {
            this._onFailure(err);
            throw err;
        }
    }

    /**
     * Wrap a promise with a timeout.
     */
    _withTimeout(fn, ms) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const err = new Error(`CircuitBreaker[${this.name}]: request timed out after ${ms}ms`);
                err.isTimeout = true;
                reject(err);
            }, ms);

            Promise.resolve()
                .then(() => fn())
                .then((val) => {
                    clearTimeout(timer);
                    resolve(val);
                })
                .catch((err) => {
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    _onSuccess() {
        this._totalSuccess++;
        this._consecutiveFailures = 0;
        this._recordResult(true);

        if (this._state === STATE.HALF_OPEN) {
            this._halfOpenSuccesses++;
            if (this._halfOpenSuccesses >= this.halfOpenMaxTrials) {
                this._transition(STATE.CLOSED);
            }
        }
    }

    _onFailure(err) {
        this._totalFailure++;
        this._consecutiveFailures++;
        this._recordResult(false);

        if (this._state === STATE.HALF_OPEN) {
            // Any failure in HALF_OPEN sends us back to OPEN
            console.log(`[CircuitBreaker] ${this.name}: HALF_OPEN trial failed — reverting to OPEN`);
            this._transition(STATE.OPEN);
            return;
        }

        if (this._state === STATE.CLOSED) {
            // Check consecutive failure threshold
            if (this._consecutiveFailures >= this.consecutiveFailureThreshold) {
                console.log(
                    `[CircuitBreaker] ${this.name}: ${this._consecutiveFailures} consecutive failures — opening circuit`
                );
                this._transition(STATE.OPEN);
                return;
            }

            // Check failure rate threshold over sliding window
            const failureRate = this._getFailureRate();
            if (this._window.length >= this.windowSize && failureRate >= this.failureRateThreshold) {
                console.log(
                    `[CircuitBreaker] ${this.name}: failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold — opening circuit`
                );
                this._transition(STATE.OPEN);
            }
        }
    }

    _recordResult(success) {
        this._window.push(success);
        if (this._window.length > this.windowSize) {
            this._window.shift();
        }
    }

    _getFailureRate() {
        if (this._window.length === 0) return 0;
        const failures = this._window.filter((r) => !r).length;
        return failures / this._window.length;
    }

    /**
     * Check if enough time has passed in OPEN to transition to HALF_OPEN.
     */
    _maybeTransitionFromOpen() {
        if (this._state === STATE.OPEN && this._openedAt !== null) {
            const elapsed = Date.now() - this._openedAt;
            if (elapsed >= this.openStateDuration) {
                this._transition(STATE.HALF_OPEN);
            }
        }
    }

    _transition(newState) {
        const prev = this._state;
        this._state = newState;
        console.log(`[CircuitBreaker] ${this.name}: ${prev} → ${newState}`);

        if (newState === STATE.OPEN) {
            this._openedAt = Date.now();
            this._halfOpenTrials = 0;
            this._halfOpenSuccesses = 0;
        } else if (newState === STATE.HALF_OPEN) {
            this._openedAt = null;
            this._halfOpenTrials = 0;
            this._halfOpenSuccesses = 0;
        } else if (newState === STATE.CLOSED) {
            this._openedAt = null;
            this._halfOpenTrials = 0;
            this._halfOpenSuccesses = 0;
            this._consecutiveFailures = 0;
            this._window = [];
        }
    }

    /**
     * Returns the metrics snapshot for the /metrics endpoint.
     */
    getMetrics() {
        this._maybeTransitionFromOpen();
        const totalCalls = this._totalSuccess + this._totalFailure;
        const failureRate = totalCalls > 0 ? ((this._totalFailure / totalCalls) * 100).toFixed(1) + '%' : '0.0%';

        return {
            state: this._state,
            failureRate,
            successfulCalls: this._totalSuccess,
            failedCalls: this._totalFailure,
            windowFailureRate: this._window.length > 0
                ? ((this._window.filter((r) => !r).length / this._window.length) * 100).toFixed(1) + '%'
                : '0.0%',
            consecutiveFailures: this._consecutiveFailures,
            halfOpenTrials: this._state === STATE.HALF_OPEN ? `${this._halfOpenSuccesses}/${this.halfOpenMaxTrials}` : 'N/A',
        };
    }

    /**
     * Reset the breaker to CLOSED (for testing/admin use).
     */
    reset() {
        this._transition(STATE.CLOSED);
        this._totalSuccess = 0;
        this._totalFailure = 0;
    }
}

class CircuitOpenError extends Error {
    constructor(name, state) {
        super(`CircuitBreaker[${name}] is ${state} — request rejected (fast-fail)`);
        this.name = 'CircuitOpenError';
        this.circuitName = name;
        this.circuitState = state;
        this.isCircuitOpen = true;
    }
}

module.exports = { CircuitBreaker, CircuitOpenError, STATE };
