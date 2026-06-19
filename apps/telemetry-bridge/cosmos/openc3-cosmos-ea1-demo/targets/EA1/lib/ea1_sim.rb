# encoding: ascii-8bit

require 'openc3'

module OpenC3
  # Simulated EA-1 target: steady-state turbopump + combustion-chamber
  # telemetry, then a bearing-race micro-pitting fault.
  #
  # Timeline (seconds after the target connects):
  #   0  .. 30   nominal — vibration sits in the noise floor (~0.15 g RMS)
  #   30 .. end  bearing-race fault — TURBOPUMP.VIBRATION_RMS steps up and
  #              ramps (Act 2 spike); BEARING_TEMP_C creeps with it
  #   45 .. end  the fault couples into the chamber mount —
  #              CHAMBER.VIBRATION_Y rises too (Act 5 second-sensor cluster)
  #
  # This drives the two channels the telemetry-bridge maps to
  # EA1-027-TP-VIB-X-014 and EA1-027-CC-VIB-Y-022, so the bridge's z-score
  # detector fires the same Act 2 / Act 5 story it fires on the Web Worker
  # mock — only now the upstream is a real COSMOS packet stream.
  class Ea1Sim < SimulatedTarget
    FAULT_START_S   = 30.0  # bearing-race fault onset (Act 2)
    CLUSTER_START_S = 45.0  # chamber-mount coupling (Act 5)

    # Packet emission rate, in 100 Hz ticks. 1 → 100 Hz (matches the mock
    # and keeps the storyboard timing intact); set to 10 for a more
    # COSMOS-typical 10 Hz. See apps/aerospace-rca/docs/REAL-TELEMETRY.md.
    EMIT_RATE = 1

    def set_rates
      set_rate('TURBOPUMP', EMIT_RATE)
      set_rate('CHAMBER', EMIT_RATE)
    end

    # No commanding in the demo.
    def write(packet); end

    def read(count_100hz, time)
      @start ||= time
      elapsed = time - @start
      packets = []
      get_pending_packets(count_100hz).each do |packet|
        case packet.packet_name
        when 'TURBOPUMP' then fill_turbopump(packet, elapsed, time)
        when 'CHAMBER'   then fill_chamber(packet, elapsed, time)
        end
        packets << packet
      end
      packets
    end

    private

    # Symmetric uniform noise of half-width `amp`.
    def noise(amp)
      (rand - 0.5) * 2.0 * amp
    end

    def stamp(packet, time)
      packet.write('TIMESEC', time.tv_sec)
      packet.write('TIMEUS',  time.tv_usec)
    end

    def fill_turbopump(packet, elapsed, time)
      stamp(packet, time)

      vib  = 0.15 + noise(0.05)   # nominal RMS floor
      temp = 95.0 + noise(1.0)    # nominal bearing temp (C)

      if elapsed >= FAULT_START_S
        f = elapsed - FAULT_START_S
        # Step up immediately (the spike), then keep ramping so the signal
        # stays ahead of the detector's rolling baseline.
        vib  += 1.10 + 0.12 * f + noise(0.25)
        temp += 6.0  + 0.35 * f + noise(0.8)
      end

      packet.write('VIBRATION_RMS',  vib)
      packet.write('BEARING_TEMP_C', temp)
      packet.write('SHAFT_RPM',      36_000.0 + noise(40.0))
      packet.write('INLET_PSI',      820.0 + noise(3.0))
    end

    def fill_chamber(packet, elapsed, time)
      stamp(packet, time)

      vib_y = 0.15 + noise(0.05)
      if elapsed >= CLUSTER_START_S
        f = elapsed - CLUSTER_START_S
        vib_y += 0.90 + 0.10 * f + noise(0.20)
      end

      packet.write('CHAMBER_PSI',   1_900.0 + noise(6.0))
      packet.write('VIBRATION_Y',   vib_y)
      packet.write('THROAT_TEMP_C', 1_650.0 + noise(8.0))
    end
  end
end
