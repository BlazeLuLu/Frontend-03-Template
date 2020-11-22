export let linear = v => v;

export function cubicBezier(p1x, p1y, p2x, p2y) {
    const ZERO_LIMIT = 1e-6;

    const cx = 3 * p1x;
    const bx = 3 * (p2x - p1x) - cx;
    const ax = 1 - cx -bx;

    const cy = 3 * p1y;
    const by = 3 * (p2y - p1y) - cy;
    const ay = 1 - cy - by;

    function sampleCurveX(t) {
        return ((ax * t + bx) * t + cx) * t;
    }

    function sampleCurveY(t) {
        return ((ay * t + by) * t + cy) * t;
    }

    function sampleCurveDerivativeX(t) {
        return (3 * ax * t + 2 * bx) * t + cx;
    }

    function solveCurveX(x) {
        let t0;
        let t1;
        let t2;
        let x2;
        let d2;
        let i;

        for (t2 = x, i = 0; i < 8; i++) {
            x2 = sampleCurveX(t2) - x;
            if (Math.abs(x2) < ZERO_LIMIT)
                return t2;
            d2 = sampleCurveDerivativeX(t2);
            if (Math.abs(d2) < ZERO_LIMIT)
                break;
            t2 = t2 - x2 / d2;
        }

        t0 = 0;
        t1 = 1;
        t2 = x;

        if (t2 < t0)
            return t0;
        if (t2 > t1)
            return t1;

        while (t0 < t1) {
            x2 = sampleCurveX(t2);
            if (Math.abs(x2 - x) < ZERO_LIMIT)
                return t2;
            if (x > x2)
                t0 = t2;
            else
                t1 = t2;
            t2 = (t1 - t0) * .5 + t0;
        }

        return t2;
    }

    function solve(x) {
        return sampleCurveY(solveCurveX(x));
    }

    return solve;
}

export let ease = cubicBezier(.25,.1,.25,1);
export let easeIn = cubicBezier(.42,0,1,1);
export let easeOut = cubicBezier(0,0,.58,1);
export let easeInOut = cubicBezier(.42,0,.58,1);