import React, { useRef, useEffect, memo } from 'react'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

function clampSentiment(v) {
  const x = Number(v)
  if (!Number.isFinite(x)) return 0
  return Math.max(-1, Math.min(1, x))
}

function ema(data, alpha = 0.2) {
  const arr = Array.isArray(data) ? data : []
  if (!arr.length) return []
  const a = Math.min(1, Math.max(0.0001, Number(alpha) || 0.2))
  const result = new Array(arr.length)
  result[0] = clampSentiment(arr[0])
  for (let i = 1; i < arr.length; i++) {
    const v = clampSentiment(arr[i])
    result[i] = clampSentiment(a * v + (1 - a) * result[i - 1])
  }
  return result
}

function SentimentCharts({ sentiment = {}, volume = {}, type }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  const labels = Object.keys(sentiment)
  const sentimentValues = Object.values(sentiment).map(clampSentiment)
  const volumeValues = Object.values(volume)
  const smoothSentimentValues = ema(sentimentValues, 0.2)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    const ctx = el.getContext('2d')
    if (chartRef.current) chartRef.current.destroy()

    const tooltipConfig = {
      backgroundColor: '#161b22',
      borderColor: 'rgba(48, 54, 61, 0.8)',
      borderWidth: 1,
      titleColor: '#8b949e',
      bodyColor: '#e6edf3',
      titleFont: { family: 'Inter', size: 11 },
      bodyFont: { family: 'Inter', size: 12, weight: 600 },
      padding: 8,
      cornerRadius: 6,
      displayColors: false,
    }

    const gold = '#facc15'
    const goldFaint = 'rgba(250, 204, 21, 0.2)'

    const glowPlugin = {
      id: 'sentimentGlow',
      beforeDatasetsDraw: (chart) => {
        // Apply glow only for the main smoothed dataset (index 1).
        const ds = chart?.data?.datasets
        if (!Array.isArray(ds) || ds.length < 2) return
        const meta = chart.getDatasetMeta(1)
        if (!meta?.visible) return
        const ctx = chart.ctx
        ctx.save()
        ctx.shadowColor = 'rgba(250, 204, 21, 0.35)'
        ctx.shadowBlur = 12
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
      },
      afterDatasetsDraw: (chart) => {
        chart.ctx.restore()
      },
    }

    const commonOptions = {
      maintainAspectRatio: false,
      animation: { duration: 900, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: 'rgba(230, 237, 243, 0.75)',
            boxWidth: 10,
            boxHeight: 10,
            padding: 10,
            usePointStyle: true,
            pointStyle: 'line',
            font: { family: 'Inter', size: 11, weight: 600 },
          },
        },
        tooltip: tooltipConfig,
      },
      scales: {
        x: { display: false, grid: { display: false } },
        y: {
          display: true,
          ticks: { display: false },
          suggestedMin: -1,
          suggestedMax: 1,
          grid: {
            color: 'rgba(255, 255, 255, 0.06)',
            drawBorder: false,
          },
        },
      },
      interaction: { intersect: false, mode: 'index' },
    }

    if (type === 'sentiment') {
      const gradient = ctx.createLinearGradient(0, 0, 0, 220)
      gradient.addColorStop(0, 'rgba(250, 204, 21, 0.08)')
      gradient.addColorStop(1, 'rgba(250, 204, 21, 0)')
      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Raw sentiment',
              data: sentimentValues,
              borderColor: goldFaint,
              backgroundColor: 'rgba(0, 0, 0, 0)',
              borderWidth: 1,
              fill: false,
              tension: 0.15,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHoverBackgroundColor: gold,
            },
            {
              label: 'Trend (smoothed)',
              data: smoothSentimentValues,
              borderColor: gold,
              backgroundColor: gradient,
              borderWidth: 3,
              fill: true,
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 5,
              pointHoverBackgroundColor: gold,
            },
          ],
        },
        options: commonOptions,
        plugins: [glowPlugin],
      })
    } else {
      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Msg Volume',
              data: volumeValues,
              backgroundColor: 'rgba(47, 129, 247, 0.6)',
              borderRadius: 3,
              hoverBackgroundColor: '#2f81f7',
            },
          ],
        },
        options: commonOptions,
      })
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [JSON.stringify(labels), JSON.stringify(sentimentValues), JSON.stringify(smoothSentimentValues), JSON.stringify(volumeValues), type])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%' }}
      aria-label={type === 'sentiment' ? 'Sentiment trend' : 'Volume pressure'}
    />
  )
}

export default memo(SentimentCharts)
