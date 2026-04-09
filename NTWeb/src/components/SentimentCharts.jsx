import React, { useRef, useEffect, memo } from 'react'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

function SentimentCharts({ sentiment = {}, volume = {}, type }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  const labels = Object.keys(sentiment)
  const sentimentValues = Object.values(sentiment)
  const volumeValues = Object.values(volume)

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

    const commonOptions = {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipConfig },
      scales: {
        x: { display: false },
        y: { display: false, grid: { display: false } },
      },
      interaction: { intersect: false, mode: 'index' },
    }

    if (type === 'sentiment') {
      const gradient = ctx.createLinearGradient(0, 0, 0, 200)
      gradient.addColorStop(0, 'rgba(210, 153, 34, 0.25)')
      gradient.addColorStop(1, 'rgba(210, 153, 34, 0)')
      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Sentiment Score',
              data: sentimentValues,
              borderColor: '#d29922',
              backgroundColor: gradient,
              borderWidth: 1.5,
              fill: true,
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHoverBackgroundColor: '#d29922',
            },
          ],
        },
        options: commonOptions,
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
  }, [JSON.stringify(labels), JSON.stringify(sentimentValues), JSON.stringify(volumeValues), type])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%' }}
      aria-label={type === 'sentiment' ? 'Sentiment trend' : 'Volume pressure'}
    />
  )
}

export default memo(SentimentCharts)
