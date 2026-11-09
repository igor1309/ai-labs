import SwiftUI

/// Rows one under the other with a hairline between them.
public struct DividedList<Data: RandomAccessCollection, ID: Hashable, Row: View>: View {

    let data: Data
    let id: KeyPath<Data.Element, ID>
    let row: (Data.Element) -> Row

    public init(_ data: Data, id: KeyPath<Data.Element, ID>, @ViewBuilder row: @escaping (Data.Element) -> Row) {

        self.data = data
        self.id = id
        self.row = row
    }

    public var body: some View {

        VStack(alignment: .leading, spacing: 0) {
            ForEach(data, id: id) { element in
                row(element)
                    .padding(.vertical, Tokens.space3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .bottom) {
                        if element[keyPath: id] != data.last?[keyPath: id] { Rectangle().fill(Tokens.lineSoft).frame(height: 1) }
                    }
            }
        }
    }
}

/// A label and its value on one row.
public struct KeyValueRow: View {

    let title: String
    let value: String

    public init(_ title: String, value: String) {

        self.title = title
        self.value = value
    }

    public var body: some View {

        HStack(spacing: Tokens.space3) {
            Text(title).typeRole(.body)
            Spacer(minLength: .zero)
            Text(value).typeRole(.code)
        }
        .accessibilityElement(children: .combine)
    }
}
