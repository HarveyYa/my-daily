import {useEffect, useState} from 'react'
import DailyReport from './DailyReport'

export default function App() {
    const [route, setRoute] = useState('')

    useEffect(() => {
        if (!window.utools) {
            setRoute('daily-report')
            return
        }
        window.utools.onPluginEnter((action) => {
            setRoute(action.code)
        })
        window.utools.onPluginOut((isKill) => {
            setRoute('')
        })
    }, [])

    if (route === 'daily-report') {
        return <DailyReport/>
    }

    return null
}
