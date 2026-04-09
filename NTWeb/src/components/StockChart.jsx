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
    if (!ticker || !period) return
    // Default scan chart is 3mo; reuse that payload instead of refetching on first paint.
    // After viewing another period, we must restore from initialData when switching back to 3mo.
    if (period === '3mo') {
      setLabels(initialData?.labels || [])
      setPrices(initialData?.prices || [])
      return
    }
    let cancelled = false
    getChart(ticker, period)
      .then((data) => {
        if (!cancelled && data?.labels && data?.prices) {
          setLabels(data.labels)
          setPrices(data.prices)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [ticker, period, initialData])

  useEffect(() => {
    const el = canvasRef.current
    if (!el || !labels.length) return

    const ctx = el.getContext('2d')
    if (chartRef.current) chartRef.current.destroy()

    const gradient = ctx.createLinearGradient(0, 0, 0, 300)
    gradient.addColorStop(0, 'rgba(47, 129, 247, 0.18)')
    gradient.addColorStop(1, 'rgba(47, 129, 247, 0)')

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Close',
            data: prices,
            borderColor: '#2f81f7',
            backgroundColor: gradient,
            borderWidth: 1.5,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#2f81f7',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#161b22',
            borderColor: 'rgba(48, 54, 61, 0.8)',
            borderWidth: 1,
            titleColor: '#8b949e',
            bodyColor: '#e6edf3',
            titleFont: { family: 'Inter', size: 11 },
            bodyFont: { family: 'Inter', size: 13, weight: 600 },
            padding: 10,
            cornerRadius: 6,
            displayColors: false,
          },
        },
        scales: {
          x: {
            display: true,
            ticks: { color: '#6e7681', font: { family: 'Inter', size: 10 }, maxTicksLimit: 8 },
            grid: { color: 'rgba(48, 54, 61, 0.3)' },
            border: { color: 'rgba(48, 54, 61, 0.3)' },
          },
          y: {
            display: true,
            ticks: { color: '#6e7681', font: { family: 'Inter', size: 10 } },
            grid: { color: 'rgba(48, 54, 61, 0.3)' },
            border: { color: 'transparent' },
          },
        },
        interaction: {
          intersect: false,
          mode: 'index',
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

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%' }}
      aria-label={`Stock chart ${periodLabel}`}
    />
  )
}

export default memo(StockChart)
