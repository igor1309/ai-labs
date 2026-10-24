import AudioConversion
import Foundation

/// Computes a write independently, feeding preceding context before its input
/// and ending the converter before selecting the write's output frames.
func referenceWrite(_ samples: [Float], preceding: [Float], rate: Double) throws -> [Float] {

    let context = Array(preceding.suffix(max(1, Int(ceil(rate)))))
    let converter = try Converter(from: rate, to: 48_000)
    var converted = try converter.convertAvailable(context)
    converted += try converter.convertAvailable(samples)
    converted += try converter.flush()
    let first = Int((Double(preceding.count) * 48_000 / rate).rounded())
    let end = Int((Double(preceding.count + samples.count) * 48_000 / rate).rounded())
    return (first..<end).map { frame in
        let contextTime = Double(preceding.count - context.count) / rate
        let position = Double(frame) - contextTime * 48_000
        let index = max(0, min(Int(floor(position)), converted.count - 1))
        let next = min(index + 1, converted.count - 1)
        return converted[index] * Float(1 - (position - floor(position)))
            + converted[next] * Float(position - floor(position))
    }
}
