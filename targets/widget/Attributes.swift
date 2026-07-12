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

// Participant-facing ticket Live Activity (Lock Screen / Dynamic Island).
struct TicketActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var checkedIn: Bool
    }

    var eventName: String
    var venue: String
    var shortCode: String
    var startsAt: Date
}
