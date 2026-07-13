# TimesFM — Example Notebooks

A hands-on notebook series for **TimesFM 2.5**, Google Research's pretrained
foundation model for **zero-shot time-series forecasting**. The notebooks go
from installing the package all the way to real-world use cases, batching,
probabilistic forecasting, anomaly detection, covariates, and fine-tuning.

Every notebook is **self-contained** — it loads the model and generates its own
synthetic data, so you can run them in any order (though the numbering is a
suggested learning path).

> **First run downloads the weights.** The TimesFM 2.5 checkpoint (~800 MB)
> downloads from Hugging Face the first time you call `from_pretrained(...)` and
> is then cached in `~/.cache/huggingface/`. Run notebook `01` first to verify
> your machine can handle it.

## How to run

```bash
# from the repo root
pip install "timesfm[torch]" jupyter matplotlib pandas
jupyter notebook Notebooks/
# then open 01_installation_and_setup.ipynb
```

## The notebooks

### Fundamentals
| # | Notebook | What you learn |
| - | -------- | -------------- |
| 01 | `01_installation_and_setup.ipynb` | Install, run the preflight system check, verify imports |
| 02 | `02_load_the_model.ipynb` | `from_pretrained` + `compile`, every `ForecastConfig` flag explained |
| 03 | `03_your_first_forecast.ipynb` | The minimal forecast; reading `point` vs `quantile` output |
| 04 | `04_single_series_with_plot.ipynb` | One series, 52-week forecast with 60% & 80% prediction bands |

### Core capabilities
| # | Notebook | What you learn |
| - | -------- | -------------- |
| 05 | `05_batch_forecasting.ipynb` | Forecast many series at once; export JSON/CSV; small-multiples grid |
| 06 | `06_probabilistic_quantiles.ipynb` | Quantile indexing, fan charts, turning intervals into decisions |
| 07 | `07_forecast_from_csv.ipynb` | Load a CSV with pandas + the built-in `forecast_csv.py` CLI |
| 08 | `08_backtesting_and_metrics.ipynb` | Holdout & rolling backtests: MAE, RMSE, MAPE, interval coverage |

### Advanced techniques
| # | Notebook | What you learn |
| - | -------- | -------------- |
| 09 | `09_anomaly_detection.ipynb` | Walk-forward anomaly detection via prediction intervals |
| 10 | `10_covariates_xreg.ipynb` | Exogenous drivers: price, promotions, holidays, region (XReg) |
| 15 | `15_long_context_forecasting.ipynb` | Using long context (up to 16k) for nested seasonalities |
| 16 | `16_finetuning_lora_overview.ipynb` | When/how to fine-tune with LoRA (PEFT) |

### Real-world use cases
| # | Notebook | Domain |
| - | -------- | ------ |
| 11 | `11_retail_demand_planning.ipynb` | Retail — reorder points & safety stock |
| 12 | `12_finance_revenue_cashflow.ipynb` | Finance — MRR / cashflow projection (allows negatives) |
| 13 | `13_energy_load_forecasting.ipynb` | Energy — hourly electricity load, peak analysis |
| 14 | `14_iot_sensor_monitoring.ipynb` | IoT — predictive maintenance from sensor drift |

## Quick reference — output shapes

`model.forecast(horizon, inputs)` returns `(point_forecast, quantile_forecast)`:

| Array | Shape | Meaning |
| ----- | ----- | ------- |
| `point_forecast` | `(n_series, horizon)` | median point forecast |
| `quantile_forecast` | `(n_series, horizon, 10)` | mean + deciles q10…q90 |

Quantile axis indices: `0` = mean, `1` = q10, `5` = q50 (median), `9` = q90.
The 80% interval is `[q10, q90]` = indices `[1, 9]`.

## Learn more
- Repo skill & scripts: [`../timesfm-forecasting/`](../timesfm-forecasting/)
- Paper: [A decoder-only foundation model for time-series forecasting](https://arxiv.org/abs/2310.10688) (ICML 2024)
- Checkpoints: [TimesFM Hugging Face Collection](https://huggingface.co/collections/google/timesfm-release-66e4be5fdb56e960c1e482a6)
