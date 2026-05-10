import {useEffect, useState} from 'react'
import DailyReport from './DailyReport'

export default function App() {
    const [enterAction, setEnterAction] = useState({})
    const [route, setRoute] = useState('')

    useEffect(() => {
        if (!window.utools) {
            setRoute('daily-report')
            return
        }
        window.utools.onPluginEnter((action) => {
            setRoute(action.code)
            setEnterAction(action)
        })
        window.utools.onPluginOut((isKill) => {
            setRoute('')
        })
    }, [])

    if (route === 'daily-report') {
        return <DailyReport enterAction={enterAction}/>
    }

    return null
}
