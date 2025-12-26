import Foundation
import ActivityKit

struct AttendActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var checkedInCount: Int
        var totalCount: Int
        var lastUpdated: Date
    }
    
    var eventId: String
    var eventName: String
}
