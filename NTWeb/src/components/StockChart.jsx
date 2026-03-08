import React, { useRef, useEffect, useState, memo } from 'react'
import { Chart, registerables } from 'chart.js'
import { getChart } from '../services/api'

Chart.register(...registerables)

function StockChart({ initialData, ticker, period, periodLabel }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const [labels, setLabels] = useState(initialData?.labels || [])
  const [prices, setPrices] = useState(initialData?.prices || [])

  useEffect(() => {
    setLabels(initialData?.labels || [])
    setPrices(initialData?.prices || [])
  }, [initialData])

  useEffect(() => {
    if (!ticker || !period || period === '3mo') return
    let cancelled = false
    getChart(ticker, period)
      .then((data) => {
        if (!cancelled && data?.labels && data?.prices) {
          setLabels(data.labels)
          setPrices(data.prices)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ticker, period])

  useEffect(() => {
    const el = canvasRef.current
    if (!el || !labels.length) return

    const ctx = el.getContext('2d')
    if (chartRef.current) chartRef.current.destroy()

    const gradient = ctx.createLinearGradient(0, 0, 0, 250)
    gradient.addColorStop(0, 'rgba(34, 211, 238, 0.25)')
    gradient.addColorStop(1, 'rgba(34, 211, 238, 0)')

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Close',
            data: prices,
            borderColor: '#22d3ee',
            backgroundColor: gradient,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            display: true,
            ticks: { color: '#94a3b8', maxTicksLimit: 8 },
            grid: { color: 'rgba(255,255,255,0.06)' },
          },
          y: {
            display: true,
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.06)' },
          },
        },
      },
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [labels, prices])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} aria-label={`Stock chart ${periodLabel}`} />
}

export default memo(StockChart)
