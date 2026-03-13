'use strict';

const STATE = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
};

class CircuitBreaker {
    // constructor
    constructor(name, options = {}) {
        this.name = name;
        this.state = STATE.CLOSED;

        // sliding window config
        this.windowSize = options.windowSize || 10;
        this.failureRateThreshold = options.failureRateThreshold || 0.5;
        this.consecutiveFailureThreshold = options.consecutiveFailureThreshold || 5;

        // open state config
        this.openStateDuration = options.openStateDuration || 30000;
        this.halfOpenMaxTrials = options.halfOpenMaxTrials || 3;

        // sliding window: array of true (success) / false (failure)
        this.window = [];

        // tracking
        this.consecutiveFailures = 0;
        this.halfOpenTrials = 0;
        this.halfOpenSuccesses = 0;
        this.openedAt = null;

        // metrics
        this.metrics = {
            totalRequests: 0,
            totalFailures: 0,
            totalSuccesses: 0,
            stateTransitions: [],
        };
    }

    // execute
    async execute(fn) {
        this.metrics.totalRequests++;

        if (this.state === STATE.OPEN) {
            // Check if cooldown has passed → try HALF_OPEN
            if (Date.now() - this.openedAt >= this.openStateDuration) {
                this._transitionTo(STATE.HALF_OPEN);
                this.halfOpenTrials = 0;
                this.halfOpenSuccesses = 0;
            } else {
                throw new Error(`CircuitBreaker [${this.name}] is OPEN — fast failing`);
            }
        }

        if (this.state === STATE.HALF_OPEN) {
            if (this.halfOpenTrials >= this.halfOpenMaxTrials) {
                throw new Error(`CircuitBreaker [${this.name}] is HALF_OPEN — max trials reached`);
            }
            this.halfOpenTrials++;
        }

        try {
            const result = await fn();
            this._onSuccess();
            return result;
        } catch (err) {
            this._onFailure();
            throw err;
        }
    }

    // onSuccess
    _onSuccess() {
        this.metrics.totalSuccesses++;
        this.consecutiveFailures = 0;
        this._recordWindow(true);

        if (this.state === STATE.HALF_OPEN) {
            this.halfOpenSuccesses++;
            if (this.halfOpenSuccesses >= this.halfOpenMaxTrials) {
                this._transitionTo(STATE.CLOSED);
                this.window = [];
            }
        }
    }

    // onFailure
    _onFailure() {
        this.metrics.totalFailures++;
        this.consecutiveFailures++;
        this._recordWindow(false);

        if (this.state === STATE.HALF_OPEN) {
            // Any failure in HALF_OPEN → go back to OPEN
            this._transitionTo(STATE.OPEN);
            this.openedAt = Date.now();
            return;
        }

        if (this.state === STATE.CLOSED) {
            const failureRate = this._getFailureRate();
            const windowFull = this.window.length >= this.windowSize;

            if (
                this.consecutiveFailures >= this.consecutiveFailureThreshold ||
                (windowFull && failureRate >= this.failureRateThreshold)
            ) {
                this._transitionTo(STATE.OPEN);
                this.openedAt = Date.now();
            }
        }
    }

    // sliding window
    _recordWindow(success) {
        this.window.push(success);
        if (this.window.length > this.windowSize) {
            this.window.shift();
        }
    }

    _getFailureRate() {
        if (this.window.length === 0) return 0;
        const failures = this.window.filter((r) => r === false).length;
        return failures / this.window.length;
    }

    // transitions
    _transitionTo(newState) {
        console.log(`[CircuitBreaker:${this.name}] ${this.state} → ${newState}`);
        this.metrics.stateTransitions.push({
            from: this.state,
            to: newState,
            at: new Date().toISOString(),
        });
        this.state = newState;
    }

    getStatus() {
        return {
            name: this.name,
            state: this.state,
            failureRate: parseFloat(this._getFailureRate().toFixed(2)),
            windowSize: this.window.length,
            consecutiveFailures: this.consecutiveFailures,
            metrics: this.metrics,
        };
    }
}

module.exports = CircuitBreaker;