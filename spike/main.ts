/**
 * Throwaway: proves a GAN i4 talks to `gan-web-bluetooth` before the real
 * feature is built on it. Served by the dev server at /spike/, never built.
 */

import { connectGanCube, type GanCubeConnection } from 'gan-web-bluetooth'

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'

/** Service UUIDs per GAN protocol generation, as csTimer's driver lists them. */
const GAN_SERVICES: Record<string, string> = {
  '6e400001-b5a3-f393-e0a9-e50e24dc4179': 'Gen2',
  '8653000a-43e6-47b7-9cb0-5fc21d4ae340': 'Gen3',
  '00000010-0000-fff7-fff6-fff5fff4fff0': 'Gen4',
  '0000fff0-0000-1000-8000-00805f9b34fb': 'Gen1',
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

let conn: GanCubeConnection | null = null
const moves: string[] = []

function log(line: string): void {
  const el = $('log')
  el.textContent = `${new Date().toLocaleTimeString()}  ${line}\n${el.textContent}`
}

function setConnected(on: boolean): void {
  for (const id of ['facelets', 'reset', 'disconnect']) $<HTMLButtonElement>(id).disabled = !on
  $<HTMLButtonElement>('connect').disabled = on
}

const supported = 'bluetooth' in navigator
$('support').textContent = supported
  ? 'Web Bluetooth is available.'
  : 'Web Bluetooth is not available in this browser. Use Chrome on Android or desktop.'

async function askMac(device: BluetoothDevice, isFallback?: boolean): Promise<string | null> {
  if (!isFallback) return null
  const saved = localStorage.getItem('spike.mac') ?? ''
  const mac = prompt(
    `Could not read the MAC of ${device.name ?? 'the cube'} automatically.\n` +
      'Find it in Cube Station: connect the cube, open its device info.\n' +
      'Format: AA:BB:CC:DD:EE:FF',
    saved,
  )
  if (mac) localStorage.setItem('spike.mac', mac.trim().toUpperCase())
  return mac ? mac.trim().toUpperCase() : null
}

$('connect').addEventListener('click', async () => {
  try {
    conn = await connectGanCube(askMac)
    setConnected(true)
    $('device').textContent = `name: ${conn.deviceName}\nmac:  ${conn.deviceMAC}`
    log('connected')
    conn.events$.subscribe((event) => {
      switch (event.type) {
        case 'MOVE':
          moves.push(event.move)
          $('moves').textContent = moves.slice(-40).join(' ')
          log(
            `MOVE ${event.move} serial=${event.serial} local=${event.localTimestamp} cube=${event.cubeTimestamp}`,
          )
          break
        case 'FACELETS':
          $('state').textContent =
            `${event.facelets}\nsolved: ${event.facelets === SOLVED}\nserial: ${event.serial}`
          break
        case 'HARDWARE':
          $('device').textContent += `\n${JSON.stringify(event, null, 1)}`
          break
        case 'BATTERY':
          log(`battery ${event.batteryLevel}%`)
          break
        case 'GYRO':
          break
        case 'DISCONNECT':
          log('disconnected')
          setConnected(false)
          conn = null
          break
      }
    })
    await conn.sendCubeCommand({ type: 'REQUEST_HARDWARE' })
    await conn.sendCubeCommand({ type: 'REQUEST_FACELETS' })
    await conn.sendCubeCommand({ type: 'REQUEST_BATTERY' })
  } catch (error) {
    log(`connect failed: ${String(error)}`)
  }
})

$('facelets').addEventListener('click', () => {
  void conn?.sendCubeCommand({ type: 'REQUEST_FACELETS' })
})

$('reset').addEventListener('click', async () => {
  await conn?.sendCubeCommand({ type: 'REQUEST_RESET' })
  await conn?.sendCubeCommand({ type: 'REQUEST_FACELETS' })
})

$('disconnect').addEventListener('click', () => {
  void conn?.disconnect()
})

/**
 * For when the library's name filter does not offer the cube at all: lists
 * every primary service, which says which protocol generation it speaks.
 */
$('scan').addEventListener('click', async () => {
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: Object.keys(GAN_SERVICES),
    })
    log(`picked "${device.name}"`)
    const server = await device.gatt!.connect()
    const services = await server.getPrimaryServices()
    for (const service of services) {
      log(`service ${service.uuid} ${GAN_SERVICES[service.uuid] ?? ''}`)
    }
    server.disconnect()
  } catch (error) {
    log(`scan failed: ${String(error)}`)
  }
})
