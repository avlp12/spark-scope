# Port discovery and loading progress

I use this branch to monitor locally running inference APIs without changing model processes. I enable discovery with `SPARK_SCOPE_AUTO_DISCOVER=1`. On Linux, the dashboard reads TCP listeners and inference-server command lines, then validates `/health` and `/v1/models`. It excludes RPC/NCCL sockets and its own dashboard port. Common inference HTTP ports are checked too. Discovery runs every 10 seconds; the selected API has its own tab, charts and metrics.

I show an HTTP 503 loading response separately from a broken connection. A healthy API without `/metrics` remains reachable, while unreported rates stay unknown.

The horizontal progress bar accepts an explicit fraction from 0 to 1 in `loading_progress`, `progress`, or `progress.value`. Without that field it stays indeterminate and says that progress is not reported. A weight-stage 100% does not imply that the engine is ready. The current standalone llama.cpp server reports only `Loading model`; an engine adapter must expose its loader callback to provide a real percentage. I do not estimate a percentage from elapsed time, GPU memory or process existence.

Validation includes local mock APIs for loading/ready states and two concurrent ports, invalid progress values, existing collector/UI tests, and browser checks of tab switching and a 37.5% fixture. No engine is started or stopped by the dashboard.
