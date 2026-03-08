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

    const commonOptions = {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false, grid: { display: false } },
      },
      interaction: { intersect: false, mode: 'index' },
    }

    if (type === 'sentiment') {
      const gradient = ctx.createLinearGradient(0, 0, 0, 200)
      gradient.addColorStop(0, 'rgba(251, 191, 36, 0.4)')
      gradient.addColorStop(1, 'rgba(251, 191, 36, 0)')
      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Sentiment Score',
              data: sentimentValues,
              borderColor: '#fbbf24',
              backgroundColor: gradient,
              fill: true,
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 5,
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
              backgroundColor: '#3b82f6',
              borderRadius: 2,
              hoverBackgroundColor: '#60a5fa',
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

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} aria-label={type === 'sentiment' ? 'Sentiment trend' : 'Volume pressure'} />
}

export default memo(SentimentCharts)
