import WidgetKit
import SwiftUI

@main
struct AttendWidgetBundle: WidgetBundle {
    var body: some Widget {
        AttendLiveActivity()
        TicketLiveActivity()
    }
}
